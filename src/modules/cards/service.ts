import type { Card, PrismaClient } from '@/generated/prisma/client.js'
import { badRequest, notFound } from '@/lib/errors.js'
import { assertPositive, money, moneyToString } from '@/lib/money.js'
import type { IssueCardBody } from './schemas.js'

export function toCardDto(card: Card) {
  return {
    ...card,
    spendingLimit: moneyToString(card.spendingLimit),
  }
}

export async function issueCard(
  prisma: PrismaClient,
  customerId: string,
  input: IssueCardBody,
): Promise<Card> {
  const account = await prisma.account.findUnique({ where: { id: input.accountId } })
  if (!account || account.customerId !== customerId) {
    throw notFound('Account not found for customer')
  }
  if (account.status !== 'ACTIVE') {
    throw badRequest('Account must be ACTIVE to issue a card')
  }

  const now = new Date()
  const last4 = String(Math.floor(1000 + Math.random() * 9000))
  return prisma.card.create({
    data: {
      customerId,
      accountId: account.id,
      type: input.type,
      status: 'ACTIVE',
      last4,
      expiryMonth: now.getMonth() + 1,
      expiryYear: now.getFullYear() + 3,
      spendingLimit: assertPositive(money(input.spendingLimit)),
    },
  })
}

export async function listCards(prisma: PrismaClient, customerId: string): Promise<Card[]> {
  return prisma.card.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function setCardFrozen(
  prisma: PrismaClient,
  cardId: string,
  customerId: string | null,
  frozen: boolean,
): Promise<Card> {
  const card = await prisma.card.findUnique({ where: { id: cardId } })
  if (!card) {
    throw notFound('Card not found')
  }
  if (customerId && card.customerId !== customerId) {
    throw notFound('Card not found')
  }
  if (card.status === 'CLOSED') {
    throw badRequest('Closed cards cannot be frozen/unfrozen')
  }
  return prisma.card.update({
    where: { id: cardId },
    data: { status: frozen ? 'FROZEN' : 'ACTIVE' },
  })
}
