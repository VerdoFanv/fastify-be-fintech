import type { PrismaClient } from '@/generated/prisma/client.js'
import { notFound } from '@/lib/errors.js'
import { moneyToString } from '@/lib/money.js'

export async function getAccountStatement(
  prisma: PrismaClient,
  accountId: string,
  page: number,
  limit: number,
  from?: Date,
  to?: Date,
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) {
    throw notFound('Account not found')
  }

  const where = {
    ledgerAccountId: account.ledgerAccountId,
    ...(from || to
      ? {
          journalEntry: {
            postedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          },
        }
      : {}),
  }

  const skip = (page - 1) * limit
  const [lines, total] = await Promise.all([
    prisma.journalLine.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { journalEntry: true },
    }),
    prisma.journalLine.count({ where }),
  ])

  return {
    account,
    total,
    data: lines.map((line) => ({
      journalEntryId: line.journalEntryId,
      postedAt: line.journalEntry.postedAt,
      reference: line.journalEntry.reference,
      description: line.journalEntry.description,
      debit: moneyToString(line.debit),
      credit: moneyToString(line.credit),
    })),
  }
}
