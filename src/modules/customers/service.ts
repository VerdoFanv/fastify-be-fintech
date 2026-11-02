import type { Customer, PrismaClient } from '@/generated/prisma/client.js'
import { notFound } from '@/lib/errors.js'
import type { UpdateCustomerBody } from './schemas.js'

export async function getCustomerByUserId(
  prisma: PrismaClient,
  userId: string,
): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { userId } })
  if (!customer) {
    throw notFound('Customer profile not found')
  }
  return customer
}

export async function getCustomerById(prisma: PrismaClient, id: string): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { id } })
  if (!customer) {
    throw notFound('Customer not found')
  }
  return customer
}

export async function updateCustomer(
  prisma: PrismaClient,
  customerId: string,
  input: UpdateCustomerBody,
): Promise<Customer> {
  return prisma.customer.update({
    where: { id: customerId },
    data: {
      fullName: input.fullName,
      phone: input.phone === undefined ? undefined : input.phone,
    },
  })
}

export async function listCustomers(
  prisma: PrismaClient,
  page: number,
  limit: number,
): Promise<{ data: Customer[]; total: number }> {
  const skip = (page - 1) * limit
  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.count(),
  ])
  return { data, total }
}
