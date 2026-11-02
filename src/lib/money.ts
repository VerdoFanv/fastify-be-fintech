import { Prisma } from '@/generated/prisma/client.js'
import { badRequest } from '@/lib/errors.js'

/*
  Money must never use JS number for arithmetic.
  IEEE-754 floats (0.1 + 0.2 !== 0.3) break ledger equality checks.
  Prisma.Decimal stores exact decimal strings; all compares go through here.
*/

export type Money = Prisma.Decimal

export function money(value: string | number | Prisma.Decimal): Money {
  try {
    const d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
    if (d.isNaN() || !d.isFinite()) {
      throw badRequest('Invalid money amount')
    }
    return d
  } catch (error) {
    if (error instanceof Error && error.name === 'AppError') {
      throw error
    }
    throw badRequest('Invalid money amount')
  }
}

export function assertPositive(amount: Money, label = 'Amount'): Money {
  if (amount.lte(0)) {
    throw badRequest(`${label} must be greater than zero`)
  }
  return amount
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.eq(b)
}

export function moneyToString(amount: Money): string {
  return amount.toFixed(4)
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((acc, v) => acc.plus(v), new Prisma.Decimal(0))
}
