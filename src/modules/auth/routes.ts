import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { unauthorized } from '@/lib/errors.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  authResponseSchema,
  loginBodySchema,
  meResponseSchema,
  registerBodySchema,
} from './schemas.js'
import { authenticateUser, findUserById, registerUser, toPublicUser } from './service.js'

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/auth/register',
    {
      schema: {
        tags: ['Auth'],
        body: registerBodySchema,
        response: {
          201: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'auth.register.createUser')
      const user = await registerUser(fastify.prisma, request.body)
      trackProcess(request, 'auth.register.signJwt')
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        role: user.role,
      })
      trackProcess(request, 'auth.register.respond')
      return reply.status(201).send(
        withPerformance(request, {
          user: toPublicUser(user),
          token,
        }),
      )
    },
  )

  fastify.post(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'auth.login.authenticate')
      const user = await authenticateUser(fastify.prisma, request.body, fastify.redis)
      trackProcess(request, 'auth.login.signJwt')
      const token = await reply.jwtSign({
        sub: user.id,
        email: user.email,
        role: user.role,
      })
      trackProcess(request, 'auth.login.respond')
      return withPerformance(request, {
        user: toPublicUser(user),
        token,
      })
    },
  )

  fastify.get(
    '/auth/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
        tags: ['Auth'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: {
          200: meResponseSchema,
        },
      },
    },
    async (request) => {
      trackProcess(request, 'auth.me.loadUser')
      const user = await findUserById(fastify.prisma, request.user.sub)
      if (!user) {
        throw unauthorized()
      }
      trackProcess(request, 'auth.me.respond')
      return withPerformance(request, { user: toPublicUser(user) })
    },
  )
}

export default authRoutes
