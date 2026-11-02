import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'

/*
  Edge rate limiting is standard mid-tier banking hygiene against credential stuffing
  and accidental client loops. Redis-backed when available; in-memory fallback in dev.
*/
async function rateLimitPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis: fastify.redis ?? undefined,
    nameSpace: 'fintech-rl:',
    allowList: (request) => {
      const path = request.url.split('?')[0] ?? ''
      return (
        path === '/health' ||
        path === '/ready' ||
        path === '/metrics' ||
        path === '/docs' ||
        path.startsWith('/docs/')
      )
    },
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit', dependencies: ['redis'] })
