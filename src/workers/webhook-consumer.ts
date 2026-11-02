import type { FastifyBaseLogger } from 'fastify'
import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'
import { env } from '@/config/env.js'
import {
  DOMAIN_TOPICS,
  getKafka,
  topicToWebhookEvent,
} from '@/lib/kafka.js'
import { enqueueWebhookEvent } from '@/lib/webhooks.js'

let running = false

export async function startWebhookConsumer(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
): Promise<(() => Promise<void>) | null> {
  const kafka = getKafka()
  if (!kafka) {
    log.info('Kafka brokers not configured; webhook consumer not started')
    return null
  }

  const consumer = kafka.consumer({ groupId: env.KAFKA_GROUP_ID })
  await consumer.connect()
  const topics = Object.values(DOMAIN_TOPICS)
  await consumer.subscribe({ topics, fromBeginning: false })

  running = true
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) {
        return
      }
      try {
        const parsed = JSON.parse(message.value.toString()) as {
          event?: string
          data?: Record<string, unknown>
        }
        const event = parsed.event ?? topicToWebhookEvent(topic)
        const data = parsed.data ?? {}
        await enqueueWebhookEvent(prisma, event, data as Prisma.InputJsonValue)
      } catch (error) {
        log.error({ err: error, topic }, 'webhook consumer failed to process message')
      }
    },
  })

  log.info({ topics }, 'Kafka webhook consumer started')

  return async () => {
    if (!running) {
      return
    }
    running = false
    await consumer.disconnect()
  }
}
