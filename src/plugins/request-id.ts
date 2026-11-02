import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string
  }
}

const HEADER = 'x-request-id'

async function requestIdPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('requestId', '')

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    const incoming = request.headers[HEADER]
    const requestId =
      typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID()
    request.requestId = requestId
    reply.header(HEADER, requestId)
    // Bind requestId into logs for correlation across services (banking observability baseline).
    request.log = request.log.child({ requestId })
  })
}

export default fp(requestIdPlugin, { name: 'request-id' })
