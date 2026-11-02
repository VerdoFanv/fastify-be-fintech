import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'

async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  const origins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  await fastify.register(cors, {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
  })
}

export default fp(corsPlugin, { name: 'cors' })
