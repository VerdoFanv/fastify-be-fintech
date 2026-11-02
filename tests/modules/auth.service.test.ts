import { describe, expect, it } from 'vitest'
import { authenticateUser, toPublicUser } from '@/modules/auth/service.js'
import { AppError } from '@/lib/errors.js'

describe('auth service DTO', () => {
  it('strips passwordHash from public user', () => {
    const user = {
      id: '1',
      email: 'a@b.com',
      passwordHash: 'secret',
      name: 'A',
      role: 'CUSTOMER' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const publicUser = toPublicUser(user)
    expect(publicUser).not.toHaveProperty('passwordHash')
    expect(publicUser.email).toBe('a@b.com')
  })

  it('temporarily locks account after 5 consecutive failed login attempts', async () => {
    const mockPrisma = {
      user: {
        findUnique: async () => null, // User not found -> triggers failed attempt
      },
    }

    const email = 'lockout-test@example.com'

    // First 5 attempts fail with 401 Unauthorized
    for (let i = 0; i < 5; i++) {
      await expect(
        authenticateUser(mockPrisma as never, { email, password: 'wrongpassword' }),
      ).rejects.toMatchObject({ statusCode: 401 })
    }

    // 6th attempt must be locked out with 403 Forbidden
    await expect(
      authenticateUser(mockPrisma as never, { email, password: 'wrongpassword' }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('Account temporarily locked'),
    })
  })
})
