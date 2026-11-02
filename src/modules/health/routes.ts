import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { isKafkaEnabled } from '@/config/env.js'
import { checkKafkaReady } from '@/lib/kafka.js'
import { trackProcess, withPerformance, withPerformanceSchema } from '@/lib/response-meta.js'

const healthResponseSchema = withPerformanceSchema({
  status: z.literal('ok'),
})

const readyResponseSchema = withPerformanceSchema({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.boolean(),
    redis: z.boolean(),
    kafka: z.boolean(),
  }),
})

const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async (request) => {
      trackProcess(request, 'health.check')
      return withPerformance(request, { status: 'ok' as const })
    },
  )

  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        response: {
          200: readyResponseSchema,
          503: readyResponseSchema,
        },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'ready.check')
      let database = false
      try {
        await fastify.prisma.$queryRaw`SELECT 1`
        database = true
      } catch {
        database = false
      }

      let redis = false
      if (!fastify.redis) {
        // Dev without Redis still reports ready redis=false but not hard-fail unless DB down.
        redis = false
      } else {
        try {
          redis = (await fastify.redis.ping()) === 'PONG'
        } catch {
          redis = false
        }
      }

      let kafka = false
      if (isKafkaEnabled()) {
        try {
          kafka = await checkKafkaReady()
        } catch {
          kafka = false
        }
      }

      const criticalOk = database && (!isKafkaEnabled() || kafka)
      const status = criticalOk ? ('ok' as const) : ('degraded' as const)
      const body = withPerformance(request, {
        status,
        checks: { database, redis, kafka },
      })
      if (!criticalOk) {
        return reply.status(503).send(body)
      }
      return body
    },
  )
}

export default healthRoutes
