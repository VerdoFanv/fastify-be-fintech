import type { LedgerAccountType, Prisma, PrismaClient } from '@/generated/prisma/client.js'
import { badRequest } from '@/lib/errors.js'
import { money, moneyEquals, moneyToString, sumMoney, type Money } from '@/lib/money.js'

export type JournalLineInput = {
  ledgerAccountId: string
  debit?: Money | string | number
  credit?: Money | string | number
  /** When set, update the customer Account.balance cache for this liability leaf. */
  customerAccountId?: string
  /** Signed delta applied to Account.balance (+ credit to customer, - debit from customer). */
  customerBalanceDelta?: Money | string | number
}

export type PostJournalInput = {
  reference: string
  description?: string
  lines: JournalLineInput[]
}

type TxClient = Prisma.TransactionClient

/*
  Normal balance (accounting convention):
  - ASSET / EXPENSE: increase with DEBIT, decrease with CREDIT
  - LIABILITY / EQUITY / INCOME: increase with CREDIT, decrease with DEBIT

  Customer deposit accounts are LIABILITY leaves on the bank's books:
  the bank owes the customer that money. So funding a customer account
  CREDITS their liability leaf; spending DEBITS it.
*/
export function isDebitNormal(type: LedgerAccountType): boolean {
  return type === 'ASSET' || type === 'EXPENSE'
}

export function normalizeLine(line: JournalLineInput): { debit: Money; credit: Money } {
  const debit = money(line.debit ?? 0)
  const credit = money(line.credit ?? 0)
  if (debit.lt(0) || credit.lt(0)) {
    throw badRequest('Journal line amounts must be non-negative')
  }
  if (debit.gt(0) && credit.gt(0)) {
    throw badRequest('A journal line cannot have both debit and credit')
  }
  if (debit.eq(0) && credit.eq(0)) {
    throw badRequest('A journal line must have a debit or a credit')
  }
  return { debit, credit }
}

/*
  Double-entry invariant: sum(debits) must equal sum(credits) for every journal.
  Unbalanced postings would invent or destroy money on the books — reject before write.
*/
export function assertBalanced(lines: { debit: Money; credit: Money }[]): void {
  const totalDebit = sumMoney(lines.map((l) => l.debit))
  const totalCredit = sumMoney(lines.map((l) => l.credit))
  if (!moneyEquals(totalDebit, totalCredit)) {
    throw badRequest(
      `Unbalanced journal: debit ${moneyToString(totalDebit)} != credit ${moneyToString(totalCredit)}`,
    )
  }
}

export function validateJournalLines(lines: JournalLineInput[]) {
  const normalized = lines.map((line) => ({
    ledgerAccountId: line.ledgerAccountId,
    ...normalizeLine(line),
  }))
  assertBalanced(normalized)
  return normalized
}

async function lockLedgerAccounts(tx: TxClient, ledgerIds: string[]): Promise<void> {
  // Sequential locks in sorted id order — prevents deadlocks between concurrent postings.
  await ledgerIds.reduce<Promise<void>>(async (prev, id) => {
    await prev
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "LedgerAccount" WHERE id = ${id} FOR UPDATE
    `
    if (rows.length === 0) {
      throw badRequest(`Ledger account not found: ${id}`)
    }
  }, Promise.resolve())
}

async function lockCustomerAccounts(tx: TxClient, accountIds: string[]): Promise<void> {
  await accountIds.reduce<Promise<void>>(async (prev, id) => {
    await prev
    const rows = await tx.$queryRaw<{ id: string; status: string; balance: Prisma.Decimal }[]>`
      SELECT id, status, balance FROM "Account" WHERE id = ${id} FOR UPDATE
    `
    if (rows.length === 0) {
      throw badRequest(`Customer account not found: ${id}`)
    }
    if (rows[0]?.status !== 'ACTIVE') {
      throw badRequest(`Customer account ${id} is not ACTIVE`)
    }
  }, Promise.resolve())
}

/*
  Pessimistic locking + deterministic lock order:
  1. Sort ledger account ids so concurrent transfers lock in the same order (avoid deadlocks).
  2. SELECT ... FOR UPDATE via raw query so two postings cannot race on the same balances.
  Then write JournalEntry/Lines and bump Account.balance caches in the same transaction.
*/
export async function postJournal(tx: TxClient, input: PostJournalInput) {
  if (input.lines.length < 2) {
    throw badRequest('Journal requires at least two lines')
  }

  const normalized = input.lines.map((line) => ({
    raw: line,
    ...normalizeLine(line),
  }))
  assertBalanced(normalized)

  const ledgerIds = [...new Set(normalized.map((l) => l.raw.ledgerAccountId))].sort()
  await lockLedgerAccounts(tx, ledgerIds)

  const customerAccountIds = [
    ...new Set(
      normalized
        .map((l) => l.raw.customerAccountId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ].sort()
  await lockCustomerAccounts(tx, customerAccountIds)

  const entry = await tx.journalEntry.create({
    data: {
      reference: input.reference,
      description: input.description,
      lines: {
        create: normalized.map((l) => ({
          ledgerAccountId: l.raw.ledgerAccountId,
          debit: l.debit,
          credit: l.credit,
        })),
      },
    },
    include: { lines: true },
  })

  const balanceUpdates = normalized.filter(
    (l) => l.raw.customerAccountId && l.raw.customerBalanceDelta !== undefined,
  )

  await balanceUpdates.reduce<Promise<void>>(async (prev, l) => {
    await prev
    const delta = money(l.raw.customerBalanceDelta!)
    const updated = await tx.account.update({
      where: { id: l.raw.customerAccountId! },
      data: { balance: { increment: delta } },
    })
    if (updated.balance.lt(0)) {
      throw badRequest('Insufficient funds')
    }
  }, Promise.resolve())

  return entry
}

export async function getSystemLedgerAccount(
  prisma: PrismaClient | TxClient,
  code: string,
) {
  const account = await prisma.ledgerAccount.findUnique({ where: { code } })
  if (!account) {
    throw badRequest(`System ledger account missing: ${code}`)
  }
  return account
}
