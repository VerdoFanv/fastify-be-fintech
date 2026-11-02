import bcrypt from 'bcryptjs'
import type { Redis } from 'ioredis'
import type { PrismaClient, User } from '@/generated/prisma/client.js'
import { conflict, forbidden, unauthorized } from '@/lib/errors.js'
import type { LoginBody, RegisterBody } from './schemas.js'

const SALT_ROUNDS = 10
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_TTL_SECONDS = 900 // 15 minutes

const inMemoryFailedAttempts = new Map<string, { count: number; lockedUntil: number }>()

async function checkLoginLockout(redis: Redis | null | undefined, email: string): Promise<void> {
  const normEmail = email.toLowerCase().trim()
  if (redis) {
    const attempts = await redis.get(`auth:failed:${normEmail}`)
    if (attempts && Number.parseInt(attempts, 10) >= MAX_FAILED_ATTEMPTS) {
      throw forbidden('Too many failed login attempts. Account temporarily locked for 15 minutes.')
    }
    return
  }

  const record = inMemoryFailedAttempts.get(normEmail)
  if (record) {
    if (Date.now() < record.lockedUntil && record.count >= MAX_FAILED_ATTEMPTS) {
      throw forbidden('Too many failed login attempts. Account temporarily locked for 15 minutes.')
    }
    if (Date.now() >= record.lockedUntil) {
      inMemoryFailedAttempts.delete(normEmail)
    }
  }
}

async function recordFailedLogin(redis: Redis | null | undefined, email: string): Promise<void> {
  const normEmail = email.toLowerCase().trim()
  if (redis) {
    const key = `auth:failed:${normEmail}`
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, LOCKOUT_TTL_SECONDS)
    }
    return
  }

  const record = inMemoryFailedAttempts.get(normEmail)
  const currentCount = record && Date.now() < record.lockedUntil ? record.count + 1 : 1
  inMemoryFailedAttempts.set(normEmail, {
    count: currentCount,
    lockedUntil: Date.now() + LOCKOUT_TTL_SECONDS * 1000,
  })
}

async function resetFailedLogin(redis: Redis | null | undefined, email: string): Promise<void> {
  const normEmail = email.toLowerCase().trim()
  if (redis) {
    await redis.del(`auth:failed:${normEmail}`).catch(() => {})
  } else {
    inMemoryFailedAttempts.delete(normEmail)
  }
}

export type PublicUser = Omit<User, 'passwordHash'>

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function registerUser(prisma: PrismaClient, input: RegisterBody): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw conflict('Email already registered')
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name ?? input.fullName,
      role: 'CUSTOMER',
      customer: {
        create: {
          fullName: input.fullName,
          phone: input.phone,
          kycStatus: 'NONE',
        },
      },
    },
  })
}

export async function authenticateUser(
  prisma: PrismaClient,
  input: LoginBody,
  redis?: Redis | null,
): Promise<User> {
  await checkLoginLockout(redis, input.email)

  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) {
    await recordFailedLogin(redis, input.email)
    throw unauthorized('Invalid email or password')
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) {
    await recordFailedLogin(redis, input.email)
    throw unauthorized('Invalid email or password')
  }

  await resetFailedLogin(redis, input.email)
  return user
}

export async function findUserById(prisma: PrismaClient, id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}
