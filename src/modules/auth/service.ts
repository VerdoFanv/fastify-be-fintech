import bcrypt from 'bcryptjs'
import type { PrismaClient, User } from '@/generated/prisma/client.js'
import { conflict, unauthorized } from '@/lib/errors.js'
import type { LoginBody, RegisterBody } from './schemas.js'

const SALT_ROUNDS = 10

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

export async function authenticateUser(prisma: PrismaClient, input: LoginBody): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) {
    throw unauthorized('Invalid email or password')
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) {
    throw unauthorized('Invalid email or password')
  }

  return user
}

export async function findUserById(prisma: PrismaClient, id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } })
}
