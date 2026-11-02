import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    startedAt: bigint
    processSteps: string[]
  }
}

async function responseMetaPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('startedAt', 0n)
  fastify.decorateRequest('processSteps', null as unknown as string[])

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    request.startedAt = process.hrtime.bigint()
    request.processSteps = ['request.received']
  })
}

export default fp(responseMetaPlugin, { name: 'response-meta' })
