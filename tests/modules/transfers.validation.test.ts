import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors.js'
import { createTransfer } from '@/modules/transfers/service.js'

describe('transfer validation', () => {
  it('rejects transfer to the same account', async () => {
    const prisma = {
      account: {
        findUnique: async () => ({
          id: 'acc1',
          customerId: 'cust1',
          status: 'ACTIVE',
          currency: 'IDR',
          balance: { lt: () => false },
          ledgerAccountId: 'leaf1',
        }),
      },
    }

    await expect(
      createTransfer(prisma as never, 'cust1', {
        fromAccountId: 'acc1',
        toAccountId: 'acc1',
        amount: '10',
      }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
