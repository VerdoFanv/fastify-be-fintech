import { Prisma, type PrismaClient, type Transfer } from '@/generated/prisma/client.js'
import { badRequest, notFound } from '@/lib/errors.js'
import { postJournal } from '@/lib/ledger.js'
import { assertPositive, money, moneyToString } from '@/lib/money.js'
import { emitDomainEvent } from '@/lib/events.js'
import { DOMAIN_TOPICS } from '@/lib/kafka.js'
import type { CreateTransferBody } from './schemas.js'

export function toTransferDto(transfer: Transfer) {
  return {
    ...transfer,
    amount: moneyToString(transfer.amount),
  }
}

interface LockedAccountRow {
  id: string
  customerId: string
  ledgerAccountId: string
  currency: string
  status: string
  balance: Prisma.Decimal
}

export async function createTransfer(
  prisma: PrismaClient,
  fromCustomerId: string,
  input: CreateTransferBody,
  idempotencyKey?: string,
  meta?: { actorUserId?: string; requestId?: string },
): Promise<Transfer> {
  const amount = assertPositive(money(input.amount))
  if (input.fromAccountId === input.toAccountId) {
    throw badRequest('Cannot transfer to the same account')
  }

  /*
    Core-banking ACID transfer:
    1. Entire lookup, verification, and mutation execute inside one database transaction.
    2. Deterministic sorted row locking (SELECT ... FOR UPDATE) on Account rows prevents deadlocks
       (e.g. concurrent reverse transfers A->B and B->A lock min(A,B) first).
    3. Row locks are acquired BEFORE tx.transfer.create to avoid PostgreSQL FK KEY SHARE lock inversion.
    4. Balance & status checks run against freshly locked rows, eliminating stale dirty reads.
  */
  const transfer = await prisma.$transaction(async (tx) => {
    const sortedAccountIds = [input.fromAccountId, input.toAccountId].sort()
    const lockedAccountsMap = new Map<string, LockedAccountRow>()

    await sortedAccountIds.reduce<Promise<void>>(async (prev, accId) => {
      await prev
      const rows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, "customerId", "ledgerAccountId", currency, status, balance
        FROM "Account"
        WHERE id = ${accId}
        FOR UPDATE
      `
      if (rows.length === 0) {
        throw notFound('Account not found')
      }
      lockedAccountsMap.set(accId, rows[0]!)
    }, Promise.resolve())

    const fromAccount = lockedAccountsMap.get(input.fromAccountId)!
    const toAccount = lockedAccountsMap.get(input.toAccountId)!

    if (fromAccount.customerId !== fromCustomerId) {
      throw badRequest('fromAccountId does not belong to the authenticated customer')
    }
    if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
      throw badRequest('Both accounts must be ACTIVE')
    }
    if (fromAccount.currency !== toAccount.currency) {
      throw badRequest('Currency mismatch — use FX exchange for cross-currency')
    }
    if (new Prisma.Decimal(fromAccount.balance).lt(amount)) {
      throw badRequest('Insufficient funds')
    }

    const pending = await tx.transfer.create({
      data: {
        fromCustomerId,
        toCustomerId: toAccount.customerId,
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amount,
        currency: fromAccount.currency,
        status: 'PENDING',
        description: input.description,
        idempotencyKey,
      },
    })

    /*
      Internal transfer A → B on liability leaves:
      Debit A (liability down = customer A loses funds),
      Credit B (liability up = customer B gains funds).
      Customer balance caches move by the same signed deltas.
    */
    const entry = await postJournal(tx, {
      reference: `TRF-${pending.id}`,
      description: input.description ?? 'Internal transfer',
      lines: [
        {
          ledgerAccountId: fromAccount.ledgerAccountId,
          debit: amount,
          customerAccountId: fromAccount.id,
          customerBalanceDelta: amount.negated(),
        },
        {
          ledgerAccountId: toAccount.ledgerAccountId,
          credit: amount,
          customerAccountId: toAccount.id,
          customerBalanceDelta: amount,
        },
      ],
    })

    return tx.transfer.update({
      where: { id: pending.id },
      data: {
        status: 'POSTED',
        journalEntryId: entry.id,
      },
    })
  })

  await emitDomainEvent(prisma, {
    topic: DOMAIN_TOPICS.TRANSFER_POSTED,
    action: 'transfer.posted',
    resourceType: 'Transfer',
    resourceId: transfer.id,
    actorUserId: meta?.actorUserId,
    requestId: meta?.requestId,
    data: {
      transferId: transfer.id,
      amount: moneyToString(transfer.amount),
      currency: transfer.currency,
    },
  })

  return transfer
}

export async function getTransfer(prisma: PrismaClient, id: string): Promise<Transfer> {
  const transfer = await prisma.transfer.findUnique({ where: { id } })
  if (!transfer) {
    throw notFound('Transfer not found')
  }
  return transfer
}

export async function listTransfersForCustomer(
  prisma: PrismaClient,
  customerId: string,
  page: number,
  limit: number,
): Promise<{ data: Transfer[]; total: number }> {
  const where = {
    OR: [{ fromCustomerId: customerId }, { toCustomerId: customerId }],
  }
  const skip = (page - 1) * limit
  const [data, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transfer.count({ where }),
  ])
  return { data, total }
}
