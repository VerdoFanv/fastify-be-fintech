import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Redis } from 'ioredis'
import { env } from '@/config/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis | null
  }
}

async function redisPlugin(fastify: FastifyInstance): Promise<void> {
  let redis: Redis | null = null

  if (env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    })
    await redis.connect()
  } else if (env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required in production')
  }

  fastify.decorate('redis', redis)
  fastify.addHook('onClose', async () => {
    if (redis) {
      await redis.quit()
    }
  })
}

export default fp(redisPlugin, { name: 'redis' })
