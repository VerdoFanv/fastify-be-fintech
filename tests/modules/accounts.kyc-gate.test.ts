import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors.js'
import { openAccount } from '@/modules/accounts/service.js'

describe('accounts KYC gate', () => {
  it('rejects openAccount when customer missing', async () => {
    const prisma = {
      customer: {
        findUnique: async () => null,
      },
    }

    await expect(
      openAccount(prisma as never, 'missing', {
        productType: 'CHECKING',
        currency: 'IDR',
      }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('rejects openAccount when KYC not approved', async () => {
    const prisma = {
      customer: {
        findUnique: async () => ({
          id: 'c1',
          kycStatus: 'PENDING',
          fullName: 'Demo',
        }),
      },
    }

    await expect(
      openAccount(prisma as never, 'c1', {
        productType: 'CHECKING',
        currency: 'IDR',
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
