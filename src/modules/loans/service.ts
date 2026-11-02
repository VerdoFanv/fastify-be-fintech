import type { Loan, LoanSchedule, PrismaClient } from '@/generated/prisma/client.js'
import { Prisma } from '@/generated/prisma/client.js'
import { badRequest, notFound } from '@/lib/errors.js'
import { emitDomainEvent } from '@/lib/events.js'
import { DOMAIN_TOPICS } from '@/lib/kafka.js'
import { getSystemLedgerAccount, postJournal } from '@/lib/ledger.js'
import { assertPositive, money, moneyToString } from '@/lib/money.js'
import type { ApplyLoanBody, RepayBody } from './schemas.js'

type LoanWithSchedules = Loan & { schedules: LoanSchedule[] }

export function toLoanDto(loan: Loan | LoanWithSchedules) {
  const base = {
    ...loan,
    principal: moneyToString(loan.principal),
    interestRateAnnual: moneyToString(loan.interestRateAnnual),
  }
  if ('schedules' in loan && loan.schedules) {
    return {
      ...base,
      schedules: loan.schedules.map((s) => ({
        ...s,
        principal: moneyToString(s.principal),
        interest: moneyToString(s.interest),
        totalDue: moneyToString(s.totalDue),
      })),
    }
  }
  return base
}

/*
  Simplified equal-principal amortization:
  each installment pays principal/n plus interest on remaining principal
  at monthly rate = annual/12. Real banks use amortization formulas;
  this keeps journals easy to follow for learning.
*/
function buildSchedule(
  principal: Prisma.Decimal,
  annualRatePct: Prisma.Decimal,
  termMonths: number,
  start: Date,
) {
  const monthlyPrincipal = principal.div(termMonths)
  const monthlyRate = annualRatePct.div(100).div(12)
  let remaining = principal
  const rows: {
    installment: number
    dueDate: Date
    principal: Prisma.Decimal
    interest: Prisma.Decimal
    totalDue: Prisma.Decimal
    status: 'PENDING'
  }[] = []

  for (let i = 1; i <= termMonths; i += 1) {
    const interest = remaining.mul(monthlyRate).toDecimalPlaces(4)
    const prin = i === termMonths ? remaining : monthlyPrincipal.toDecimalPlaces(4)
    const due = new Date(start)
    due.setMonth(due.getMonth() + i)
    rows.push({
      installment: i,
      dueDate: due,
      principal: prin,
      interest,
      totalDue: prin.plus(interest),
      status: 'PENDING',
    })
    remaining = remaining.minus(prin)
  }
  return rows
}

export async function applyLoan(
  prisma: PrismaClient,
  customerId: string,
  input: ApplyLoanBody,
): Promise<LoanWithSchedules> {
  const account = await prisma.account.findUnique({ where: { id: input.disbursementAccountId } })
  if (!account || account.customerId !== customerId) {
    throw notFound('Disbursement account not found')
  }

  const principal = assertPositive(money(input.principal))
  const rate = money(input.interestRateAnnual)
  const schedules = buildSchedule(principal, rate, input.termMonths, new Date())

  return prisma.loan.create({
    data: {
      customerId,
      disbursementAccountId: account.id,
      principal,
      interestRateAnnual: rate,
      termMonths: input.termMonths,
      currency: input.currency.toUpperCase(),
      status: 'APPLIED',
      schedules: { create: schedules },
    },
    include: { schedules: { orderBy: { installment: 'asc' } } },
  })
}

export async function approveLoan(prisma: PrismaClient, loanId: string): Promise<LoanWithSchedules> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { schedules: true },
  })
  if (!loan) {
    throw notFound('Loan not found')
  }
  if (loan.status !== 'APPLIED') {
    throw badRequest('Only APPLIED loans can be approved')
  }
  return prisma.loan.update({
    where: { id: loanId },
    data: { status: 'APPROVED' },
    include: { schedules: { orderBy: { installment: 'asc' } } },
  })
}

export async function rejectLoan(prisma: PrismaClient, loanId: string): Promise<LoanWithSchedules> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan) {
    throw notFound('Loan not found')
  }
  if (loan.status !== 'APPLIED') {
    throw badRequest('Only APPLIED loans can be rejected')
  }
  return prisma.loan.update({
    where: { id: loanId },
    data: { status: 'REJECTED' },
    include: { schedules: { orderBy: { installment: 'asc' } } },
  })
}

export async function disburseLoan(
  prisma: PrismaClient,
  loanId: string,
  meta?: { actorUserId?: string; requestId?: string },
): Promise<LoanWithSchedules> {
  const updated = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: loanId },
      include: {
        schedules: true,
        disbursementAccount: true,
      },
    })
    if (!loan) {
      throw notFound('Loan not found')
    }
    if (loan.status !== 'APPROVED') {
      throw badRequest('Only APPROVED loans can be disbursed')
    }

    const loanBook = await getSystemLedgerAccount(tx, `LOAN_PORTFOLIO_${loan.currency}`)
    /*
      Disbursement journal:
      Debit LOAN_PORTFOLIO (asset: bank is owed principal),
      Credit customer deposit liability (customer receives cash in account).
    */
    const entry = await postJournal(tx, {
      reference: `LOAN-DISB-${loan.id}`,
      description: 'Loan disbursement',
      lines: [
        { ledgerAccountId: loanBook.id, debit: loan.principal },
        {
          ledgerAccountId: loan.disbursementAccount.ledgerAccountId,
          credit: loan.principal,
          customerAccountId: loan.disbursementAccountId,
          customerBalanceDelta: loan.principal,
        },
      ],
    })

    return tx.loan.update({
      where: { id: loan.id },
      data: {
        status: 'DISBURSED',
        journalEntryId: entry.id,
      },
      include: { schedules: { orderBy: { installment: 'asc' } } },
    })
  })

  await emitDomainEvent(prisma, {
    topic: DOMAIN_TOPICS.LOAN_DISBURSED,
    action: 'loan.disbursed',
    resourceType: 'Loan',
    resourceId: updated.id,
    actorUserId: meta?.actorUserId,
    requestId: meta?.requestId,
    data: {
      loanId: updated.id,
      principal: moneyToString(updated.principal),
      currency: updated.currency,
    },
  })

  return updated
}

export async function repayLoanInstallment(
  prisma: PrismaClient,
  customerId: string,
  loanId: string,
  input: RepayBody,
  meta?: { actorUserId?: string; requestId?: string },
): Promise<LoanWithSchedules> {
  const updated = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: loanId },
      include: { schedules: true, disbursementAccount: true },
    })
    if (!loan || loan.customerId !== customerId) {
      throw notFound('Loan not found')
    }
    if (loan.status !== 'DISBURSED' && loan.status !== 'REPAYING') {
      throw badRequest('Loan is not in a repayable state')
    }

    const schedule = loan.schedules.find((s) => s.id === input.scheduleId)
    if (!schedule || schedule.status === 'PAID') {
      throw badRequest('Schedule installment not payable')
    }

    const fromAccount = await tx.account.findUnique({ where: { id: input.fromAccountId } })
    if (!fromAccount || fromAccount.customerId !== customerId) {
      throw notFound('Repayment account not found')
    }
    if (fromAccount.balance.lt(schedule.totalDue)) {
      throw badRequest('Insufficient funds for repayment')
    }

    const loanBook = await getSystemLedgerAccount(tx, `LOAN_PORTFOLIO_${loan.currency}`)
    const interestIncome = await getSystemLedgerAccount(tx, `INTEREST_INCOME_${loan.currency}`)

    /*
      Repayment journal (3 lines, still balanced):
      Debit customer liability (take funds from deposit),
      Credit LOAN_PORTFOLIO by principal (asset down as loan pays down),
      Credit INTEREST_INCOME by interest portion.
    */
    await postJournal(tx, {
      reference: `LOAN-REPAY-${loan.id}-${schedule.installment}`,
      description: `Loan repayment installment ${schedule.installment}`,
      lines: [
        {
          ledgerAccountId: fromAccount.ledgerAccountId,
          debit: schedule.totalDue,
          customerAccountId: fromAccount.id,
          customerBalanceDelta: schedule.totalDue.negated(),
        },
        { ledgerAccountId: loanBook.id, credit: schedule.principal },
        { ledgerAccountId: interestIncome.id, credit: schedule.interest },
      ],
    })

    await tx.loanSchedule.update({
      where: { id: schedule.id },
      data: { status: 'PAID', paidAt: new Date() },
    })

    const remaining = await tx.loanSchedule.count({
      where: { loanId: loan.id, status: { not: 'PAID' } },
    })

    return tx.loan.update({
      where: { id: loan.id },
      data: { status: remaining === 0 ? 'CLOSED' : 'REPAYING' },
      include: { schedules: { orderBy: { installment: 'asc' } } },
    })
  })

  await emitDomainEvent(prisma, {
    topic: DOMAIN_TOPICS.LOAN_REPAID,
    action: 'loan.repaid',
    resourceType: 'Loan',
    resourceId: updated.id,
    actorUserId: meta?.actorUserId,
    requestId: meta?.requestId,
    data: {
      loanId: updated.id,
      scheduleId: input.scheduleId,
      status: updated.status,
    },
  })

  return updated
}

export async function listLoans(
  prisma: PrismaClient,
  customerId: string,
): Promise<LoanWithSchedules[]> {
  return prisma.loan.findMany({
    where: { customerId },
    include: { schedules: { orderBy: { installment: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getLoan(prisma: PrismaClient, id: string): Promise<LoanWithSchedules> {
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: { schedules: { orderBy: { installment: 'asc' } } },
  })
  if (!loan) {
    throw notFound('Loan not found')
  }
  return loan
}
