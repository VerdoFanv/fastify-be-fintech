import type { Customer, Role } from '@/generated/prisma/client.js'
import type { PrismaClient } from '@/generated/prisma/client.js'
import { forbidden, notFound } from '@/lib/errors.js'

export function assertAdmin(role: Role): void {
  if (role !== 'ADMIN') {
    throw forbidden('Admin role required')
  }
}

export async function requireCustomerForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { userId } })
  if (!customer) {
    throw notFound('Customer profile not found')
  }
  return customer
}

export function assertCustomerOwner(
  customer: Customer,
  actor: { sub: string; role: Role },
): void {
  if (actor.role === 'ADMIN') {
    return
  }
  if (customer.userId !== actor.sub) {
    throw forbidden('Not allowed to access this customer resource')
  }
}
