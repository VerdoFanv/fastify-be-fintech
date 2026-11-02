import type { Account, PrismaClient } from '@/generated/prisma/client.js'
import { badRequest, forbidden, notFound } from '@/lib/errors.js'
import { getSystemLedgerAccount, postJournal } from '@/lib/ledger.js'
import { assertPositive, money, moneyToString } from '@/lib/money.js'
import type { OpenAccountBody } from './schemas.js'

export function toAccountDto(account: Account) {
  return {
    ...account,
    balance: moneyToString(account.balance),
  }
}

function generateAccountNumber(): string {
  const n = Date.now().toString().slice(-10)
  const r = Math.floor(Math.random() * 90 + 10).toString()
  return `${n}${r}`
}

/*
  KYC gate: retail accounts only open after customer KYC is APPROVED.
  This mirrors onboarding rails where product access is blocked until identity clears.
*/
export async function openAccount(
  prisma: PrismaClient,
  customerId: string,
  input: OpenAccountBody,
): Promise<Account> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) {
    throw notFound('Customer not found')
  }
  if (customer.kycStatus !== 'APPROVED') {
    throw forbidden('KYC must be APPROVED before opening an account')
  }

  const currency = input.currency.toUpperCase()
  const initial = input.initialDeposit ? assertPositive(money(input.initialDeposit)) : money(0)

  return prisma.$transaction(async (tx) => {
    const leaf = await tx.ledgerAccount.create({
      data: {
        code: `CUST-${customerId.slice(-6)}-${Date.now()}`,
        name: `${customer.fullName} ${input.productType} ${currency}`,
        type: 'LIABILITY',
        currency,
      },
    })

    const account = await tx.account.create({
      data: {
        customerId,
        ledgerAccountId: leaf.id,
        productType: input.productType,
        currency,
        accountNumber: generateAccountNumber(),
        balance: 0,
        status: 'ACTIVE',
      },
    })

    if (initial.gt(0)) {
      const cash = await getSystemLedgerAccount(tx, `CASH_${currency}`)
      /*
        Deposit journal: Debit bank CASH (asset up), Credit customer liability (deposit up).
        Customer-facing balance cache increases by the credit amount.
      */
      await postJournal(tx, {
        reference: `OPEN-${account.id}`,
        description: 'Initial deposit on account open',
        lines: [
          { ledgerAccountId: cash.id, debit: initial },
          {
            ledgerAccountId: leaf.id,
            credit: initial,
            customerAccountId: account.id,
            customerBalanceDelta: initial,
          },
        ],
      })
    }

    return tx.account.findUniqueOrThrow({ where: { id: account.id } })
  })
}

export async function listAccountsForCustomer(
  prisma: PrismaClient,
  customerId: string,
): Promise<Account[]> {
  return prisma.account.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getAccount(prisma: PrismaClient, id: string): Promise<Account> {
  const account = await prisma.account.findUnique({ where: { id } })
  if (!account) {
    throw notFound('Account not found')
  }
  return account
}

export async function setAccountFrozen(
  prisma: PrismaClient,
  id: string,
  frozen: boolean,
): Promise<Account> {
  const account = await getAccount(prisma, id)
  if (account.status === 'CLOSED') {
    throw badRequest('Closed accounts cannot change freeze state')
  }
  return prisma.account.update({
    where: { id },
    data: { status: frozen ? 'FROZEN' : 'ACTIVE' },
  })
}
