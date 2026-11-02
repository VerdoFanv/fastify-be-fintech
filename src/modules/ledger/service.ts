import type { JournalEntry, JournalLine, LedgerAccount, PrismaClient } from '@/generated/prisma/client.js'
import { notFound } from '@/lib/errors.js'
import { moneyToString } from '@/lib/money.js'

export function toLedgerAccountDto(account: LedgerAccount) {
  return account
}

export function toJournalDto(entry: JournalEntry & { lines: JournalLine[] }) {
  return {
    id: entry.id,
    reference: entry.reference,
    description: entry.description,
    postedAt: entry.postedAt,
    lines: entry.lines.map((line) => ({
      id: line.id,
      ledgerAccountId: line.ledgerAccountId,
      debit: moneyToString(line.debit),
      credit: moneyToString(line.credit),
    })),
  }
}

export async function listChart(prisma: PrismaClient): Promise<LedgerAccount[]> {
  return prisma.ledgerAccount.findMany({ orderBy: { code: 'asc' } })
}

export async function getJournal(
  prisma: PrismaClient,
  id: string,
): Promise<JournalEntry & { lines: JournalLine[] }> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!entry) {
    throw notFound('Journal entry not found')
  }
  return entry
}

export async function listJournals(
  prisma: PrismaClient,
  page: number,
  limit: number,
): Promise<{ data: (JournalEntry & { lines: JournalLine[] })[]; total: number }> {
  const skip = (page - 1) * limit
  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({
      skip,
      take: limit,
      orderBy: { postedAt: 'desc' },
      include: { lines: true },
    }),
    prisma.journalEntry.count(),
  ])
  return { data, total }
}
