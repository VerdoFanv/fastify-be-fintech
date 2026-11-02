import { Kafka, logLevel, type Producer } from 'kafkajs'
import { env, isKafkaEnabled, kafkaBrokers } from '@/config/env.js'

export const DOMAIN_TOPICS = {
  TRANSFER_POSTED: 'fintech.transfer.posted',
  LOAN_DISBURSED: 'fintech.loan.disbursed',
  LOAN_REPAID: 'fintech.loan.repaid',
  FX_EXCHANGED: 'fintech.fx.exchanged',
  KYC_REVIEWED: 'fintech.kyc.reviewed',
} as const

export type DomainTopic = (typeof DOMAIN_TOPICS)[keyof typeof DOMAIN_TOPICS]

export type DomainEventPayload = {
  event: string
  requestId?: string
  occurredAt: string
  data: Record<string, unknown>
}

let producer: Producer | null = null
let kafka: Kafka | null = null

export function getKafka(): Kafka | null {
  if (!isKafkaEnabled()) {
    return null
  }
  if (!kafka) {
    kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: kafkaBrokers(),
      logLevel: logLevel.ERROR,
    })
  }
  return kafka
}

export async function getProducer(): Promise<Producer | null> {
  const client = getKafka()
  if (!client) {
    return null
  }
  if (!producer) {
    producer = client.producer()
    await producer.connect()
  }
  return producer
}

export async function publishDomainEvent(
  topic: DomainTopic,
  payload: DomainEventPayload,
): Promise<boolean> {
  const p = await getProducer()
  if (!p) {
    return false
  }
  await p.send({
    topic,
    messages: [
      {
        key: String(payload.data.id ?? payload.event),
        value: JSON.stringify(payload),
      },
    ],
  })
  return true
}

export async function checkKafkaReady(): Promise<boolean> {
  const client = getKafka()
  if (!client) {
    return false
  }
  const admin = client.admin()
  try {
    await admin.connect()
    await admin.describeCluster()
    return true
  } finally {
    await admin.disconnect()
  }
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect()
    producer = null
  }
}

export function topicToWebhookEvent(topic: string): string {
  return topic.replace(/^fintech\./, '')
}
