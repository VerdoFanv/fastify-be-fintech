import { createHmac } from 'node:crypto'
import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'

/*
  At-least-once delivery (v1, in-process):
  After a money event commits, we POST to each matching endpoint and store the attempt.
  Failures stay FAILED for manual retry — consumers must treat deliveries as idempotent
  (e.g. ignore duplicate transfer.posted for the same transfer id).
*/
export async function attemptWebhookDelivery(
  prisma: PrismaClient,
  deliveryId: string,
): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  })
  if (!delivery || !delivery.endpoint.active) {
    return
  }

  const body = JSON.stringify({
    id: delivery.id,
    event: delivery.event,
    payload: delivery.payload,
  })
  const signature = createHmac('sha256', delivery.endpoint.secret).update(body).digest('hex')

  try {
    const response = await fetch(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`Webhook HTTP ${response.status}`)
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SUCCESS',
        attempts: { increment: 1 },
        lastError: null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook delivery failed'
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        attempts: { increment: 1 },
        lastError: message,
      },
    })
  }
}

export async function enqueueWebhookEvent(
  prisma: PrismaClient,
  event: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      active: true,
      events: { has: event },
    },
  })

  await Promise.all(
    endpoints.map(async (endpoint) => {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          payload,
          status: 'PENDING',
          attempts: 0,
        },
      })
      await attemptWebhookDelivery(prisma, delivery.id)
    }),
  )
}
