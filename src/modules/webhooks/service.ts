import type { PrismaClient, WebhookDelivery, WebhookEndpoint } from '@/generated/prisma/client.js'
import { notFound } from '@/lib/errors.js'
import { attemptWebhookDelivery } from '@/lib/webhooks.js'
import type { RegisterWebhookBody } from './schemas.js'

export async function registerWebhook(
  prisma: PrismaClient,
  userId: string,
  input: RegisterWebhookBody,
): Promise<WebhookEndpoint> {
  return prisma.webhookEndpoint.create({
    data: {
      userId,
      url: input.url,
      secret: input.secret,
      events: input.events,
      active: true,
    },
  })
}

export async function listWebhooks(
  prisma: PrismaClient,
  userId: string,
): Promise<WebhookEndpoint[]> {
  return prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listDeliveries(
  prisma: PrismaClient,
  userId: string,
  endpointId?: string,
): Promise<WebhookDelivery[]> {
  return prisma.webhookDelivery.findMany({
    where: {
      endpoint: { userId },
      ...(endpointId ? { endpointId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function retryDelivery(
  prisma: PrismaClient,
  userId: string,
  deliveryId: string,
): Promise<WebhookDelivery> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  })
  if (!delivery || delivery.endpoint.userId !== userId) {
    throw notFound('Webhook delivery not found')
  }

  await attemptWebhookDelivery(prisma, delivery.id)
  return prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })
}
