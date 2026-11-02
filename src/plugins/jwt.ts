import fjwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '@/config/env.js'
import { buildPerformance, trackProcess } from '@/lib/response-meta.js'

export type JwtRole = 'CUSTOMER' | 'ADMIN'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: JwtRole }
    user: { sub: string; email: string; role: JwtRole }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

async function jwtPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    trackProcess(request, 'auth.jwtVerify')
    try {
      await request.jwtVerify()
      return undefined
    } catch {
      trackProcess(request, 'auth.jwtVerify.failed')
      return reply.status(401).send({
        message: 'Unauthorized',
        performance: buildPerformance(request),
      })
    }
  })
}

export default fp(jwtPlugin, { name: 'jwt' })
