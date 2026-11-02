import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { AppError } from '@/lib/errors.js'
import { buildPerformance, trackProcess } from '@/lib/response-meta.js'
import accountsRoutes from '@/modules/accounts/routes.js'
import authRoutes from '@/modules/auth/routes.js'
import cardsRoutes from '@/modules/cards/routes.js'
import customersRoutes from '@/modules/customers/routes.js'
import fxRoutes from '@/modules/fx/routes.js'
import healthRoutes from '@/modules/health/routes.js'
import kycRoutes from '@/modules/kyc/routes.js'
import ledgerRoutes from '@/modules/ledger/routes.js'
import loansRoutes from '@/modules/loans/routes.js'
import statementsRoutes from '@/modules/statements/routes.js'
import transfersRoutes from '@/modules/transfers/routes.js'
import uploadsRoutes from '@/modules/uploads/routes.js'
import webhooksRoutes from '@/modules/webhooks/routes.js'
import apiKeyPlugin from '@/plugins/api-key.js'
import corsPlugin from '@/plugins/cors.js'
import helmetPlugin from '@/plugins/helmet.js'
import jwtPlugin from '@/plugins/jwt.js'
import metricsPlugin from '@/plugins/metrics.js'
import multipartPlugin from '@/plugins/multipart.js'
import prismaPlugin from '@/plugins/prisma.js'
import rateLimitPlugin from '@/plugins/rate-limit.js'
import redisPlugin from '@/plugins/redis.js'
import requestIdPlugin from '@/plugins/request-id.js'
import responseMetaPlugin from '@/plugins/response-meta.js'
import swaggerPlugin from '@/plugins/swagger.js'

function isFastifyError(error: unknown): error is FastifyError {
  return typeof error === 'object' && error !== null && 'statusCode' in error
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>()

  await app.register(responseMetaPlugin)
  await app.register(requestIdPlugin)
  await app.register(helmetPlugin)
  await app.register(corsPlugin)
  await app.register(apiKeyPlugin)
  await app.register(metricsPlugin)
  await app.register(swaggerPlugin)
  await app.register(prismaPlugin)
  await app.register(redisPlugin)
  await app.register(rateLimitPlugin)
  await app.register(jwtPlugin)
  await app.register(multipartPlugin)

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(customersRoutes)
  await app.register(kycRoutes)
  await app.register(uploadsRoutes)
  await app.register(accountsRoutes)
  await app.register(ledgerRoutes)
  await app.register(transfersRoutes)
  await app.register(statementsRoutes)
  await app.register(cardsRoutes)
  await app.register(loansRoutes)
  await app.register(fxRoutes)
  await app.register(webhooksRoutes)

  app.setErrorHandler((error, request, reply) => {
    trackProcess(request, 'error.handle')

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        message: error.message,
        performance: buildPerformance(request),
      })
    }

    if (isFastifyError(error) && error.validation) {
      return reply.status(400).send({
        message: 'Validation error',
        details: error.validation,
        performance: buildPerformance(request),
      })
    }

    app.log.error(error)

    if (isFastifyError(error) && error.statusCode) {
      return reply.status(error.statusCode).send({
        message: error.message,
        performance: buildPerformance(request),
      })
    }

    return reply.status(500).send({
      message: 'Internal Server Error',
      performance: buildPerformance(request),
    })
  })

  return app
}
