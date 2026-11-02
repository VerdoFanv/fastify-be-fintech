import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'
import { env, isKafkaEnabled } from '@/config/env.js'
import { writeAuditLog } from '@/lib/audit.js'
import {
  publishDomainEvent,
  type DomainTopic,
  topicToWebhookEvent,
} from '@/lib/kafka.js'
import { enqueueWebhookEvent } from '@/lib/webhooks.js'

export async function emitDomainEvent(
  prisma: PrismaClient,
  input: {
    topic: DomainTopic
    action: string
    resourceType: string
    resourceId: string
    actorUserId?: string | null
    requestId?: string | null
    data: Record<string, unknown>
    metadata?: Prisma.InputJsonValue
  },
): Promise<void> {
  const metadata = (input.metadata ?? input.data) as Prisma.InputJsonValue
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    requestId: input.requestId,
    metadata,
  })

  const payload = {
    event: topicToWebhookEvent(input.topic),
    requestId: input.requestId ?? undefined,
    occurredAt: new Date().toISOString(),
    data: { id: input.resourceId, ...input.data },
  }

  const published = await publishDomainEvent(input.topic, payload)
  if (published) {
    return
  }

  // Dev/test without brokers: fall back to sync webhook fan-out so local flows still work.
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || !isKafkaEnabled()) {
    await enqueueWebhookEvent(prisma, payload.event, payload.data as Prisma.InputJsonValue)
  }
}
