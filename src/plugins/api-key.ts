import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'
import { unauthorized } from '@/lib/errors.js'

const API_KEY_HEADER = 'x-api-key'

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? url
  return (
    path === '/health' ||
    path === '/ready' ||
    path === '/metrics' ||
    path === '/docs' ||
    path.startsWith('/docs/')
  )
}

/*
  Compare secrets with timingSafeEqual so attackers cannot binary-search
  the correct API key via response-time differences (early char mismatch).
  Lengths must match first; unequal lengths already fail closed.
*/
function apiKeyMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) {
    return false
  }
  return timingSafeEqual(providedBuf, expectedBuf)
}

async function apiKeyPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    if (isPublicPath(request.url)) {
      return
    }

    const provided = request.headers[API_KEY_HEADER]
    const key = typeof provided === 'string' ? provided : undefined

    if (!key || !apiKeyMatches(key, env.API_KEY)) {
      throw unauthorized('Invalid or missing API key')
    }
  })
}

export default fp(apiKeyPlugin, { name: 'api-key' })
