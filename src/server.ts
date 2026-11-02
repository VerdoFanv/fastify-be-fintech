import { env } from '@/config/env.js'
import { buildApp } from '@/app.js'
import { disconnectKafka } from '@/lib/kafka.js'
import { startOpenTelemetry } from '@/observability/otel.js'
import { startWebhookConsumer } from '@/workers/webhook-consumer.js'

async function main(): Promise<void> {
  await startOpenTelemetry()
  const app = await buildApp()

  const stopConsumer = await startWebhookConsumer(app.prisma, app.log)

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }

  const shutdown = async () => {
    if (stopConsumer) {
      await stopConsumer()
    }
    await disconnectKafka()
    await app.close()
  }

  process.once('SIGTERM', () => {
    shutdown().catch(() => undefined)
  })
  process.once('SIGINT', () => {
    shutdown().catch(() => undefined)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
