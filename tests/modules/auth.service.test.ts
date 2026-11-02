import { describe, expect, it } from 'vitest'
import { toPublicUser } from '@/modules/auth/service.js'

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
})
