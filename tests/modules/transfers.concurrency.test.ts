import { describe, expect, it, vi } from 'vitest'
import { Prisma } from '@/generated/prisma/client.js'
import { AppError } from '@/lib/errors.js'
import { acquireIdempotencyLock, releaseIdempotencyLock } from '@/lib/idempotency.js'
import { createTransfer } from '@/modules/transfers/service.js'

describe('transfers concurrency & deadlock prevention', () => {
  it('acquires and releases idempotency lock safely', async () => {
    const userId = 'usr_123'
    const idemKey = 'key_abc'

    // First acquire must succeed
    const firstAcquire = await acquireIdempotencyLock(null, userId, idemKey)
    expect(firstAcquire).toBe(true)

    // Concurrent second acquire with same key must fail
    const secondAcquire = await acquireIdempotencyLock(null, userId, idemKey)
    expect(secondAcquire).toBe(false)

    // Release lock
    await releaseIdempotencyLock(null, userId, idemKey)

    // Subsequent acquire succeeds again
    const thirdAcquire = await acquireIdempotencyLock(null, userId, idemKey)
    expect(thirdAcquire).toBe(true)
    await releaseIdempotencyLock(null, userId, idemKey)
  })

  it('locks accounts in deterministic sorted order to prevent deadlocks', async () => {
    const queriedIds: string[] = []

    const mockTx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, accId: string) => {
        queriedIds.push(accId)
        return [
          {
            id: accId,
            customerId: accId === 'acc_z' ? 'cust1' : 'cust2',
            ledgerAccountId: `leaf_${accId}`,
            currency: 'IDR',
            status: 'ACTIVE',
            balance: new Prisma.Decimal(500),
          },
        ]
      }),
      journalEntry: {
        create: vi.fn(async (args) => ({
          id: 'je_1',
          ...args.data,
          lines: [],
        })),
      },
      account: {
        update: vi.fn(async (args) => ({
          id: args.where.id,
          balance: new Prisma.Decimal(400),
        })),
      },
      transfer: {
        create: vi.fn(async (args) => ({
          id: 'trf_1',
          ...args.data,
        })),
        update: vi.fn(async (args) => ({
          id: args.where.id,
          status: args.data.status,
          journalEntryId: args.data.journalEntryId,
          amount: new Prisma.Decimal(100),
          currency: 'IDR',
        })),
      },
    }

    const mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      webhookEndpoint: {
        findMany: vi.fn(async () => []),
      },
    }

    // Pass unsorted account IDs: 'acc_z' -> 'acc_a'
    await createTransfer(mockPrisma as never, 'cust1', {
      fromAccountId: 'acc_z',
      toAccountId: 'acc_a',
      amount: '100',
      description: 'Transfer Z to A',
    })

    // Verify IDs were locked in ascending alphabetical order: acc_a first, then acc_z
    expect(queriedIds.slice(0, 2)).toEqual(['acc_a', 'acc_z'])
  })

  it('rejects double-spending with Insufficient funds inside the row-locked transaction', async () => {
    const mockTx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, accId: string) => {
        return [
          {
            id: accId,
            customerId: accId === 'acc_1' ? 'cust1' : 'cust2',
            ledgerAccountId: `leaf_${accId}`,
            currency: 'IDR',
            status: 'ACTIVE',
            balance: new Prisma.Decimal(50), // Only 50 available
          },
        ]
      }),
    }

    const mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    }

    // Try to transfer 100 with only 50 in locked balance
    await expect(
      createTransfer(mockPrisma as never, 'cust1', {
        fromAccountId: 'acc_1',
        toAccountId: 'acc_2',
        amount: '100',
      }),
    ).rejects.toMatchObject({
      message: 'Insufficient funds',
      statusCode: 400,
    })
  })
})
