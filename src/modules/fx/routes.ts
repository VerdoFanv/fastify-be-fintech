import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { assertAdmin, requireCustomerForUser } from '@/lib/authz.js'
import { badRequest } from '@/lib/errors.js'
import {
  findIdempotentResponse,
  hashRequestPayload,
  readIdempotencyKey,
  saveIdempotentResponse,
} from '@/lib/idempotency.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  exchangeBodySchema,
  fxExchangeResponseSchema,
  fxRateListResponseSchema,
  fxRateResponseSchema,
  upsertRateBodySchema,
} from './schemas.js'
import {
  exchangeCurrency,
  listFxRates,
  toFxExchangeDto,
  toFxRateDto,
  upsertFxRate,
} from './service.js'

const fxRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get(
    '/fx/rates',
    {
      schema: {
        tags: ['FX'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: fxRateListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'fx.rates.list')
      const data = await listFxRates(fastify.prisma)
      return withPerformance(request, { data: data.map(toFxRateDto) })
    },
  )

  fastify.put(
    '/fx/rates',
    {
      schema: {
        tags: ['FX'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: upsertRateBodySchema,
        response: { 200: fxRateResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'fx.rates.upsert')
      const rate = await upsertFxRate(fastify.prisma, request.body)
      return withPerformance(request, { rate: toFxRateDto(rate) })
    },
  )

  fastify.post(
    '/fx/exchange',
    {
      schema: {
        tags: ['FX'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: exchangeBodySchema,
        response: { 201: fxExchangeResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'fx.exchange')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const idemKey = readIdempotencyKey(request.headers['idempotency-key'])
      if (!idemKey) {
        throw badRequest('Idempotency-Key header is required for FX exchange')
      }

      const requestHash = hashRequestPayload(request.body)
      const cached = await findIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path: '/fx/exchange',
        requestHash,
      })
      if (cached) {
        return reply.status(cached.status as 201).send(cached.body as never)
      }

      const exchange = await exchangeCurrency(fastify.prisma, customer.id, request.body, {
        actorUserId: request.user.sub,
        requestId: request.requestId,
      })
      const body = withPerformance(request, { exchange: toFxExchangeDto(exchange) })
      await saveIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path: '/fx/exchange',
        requestHash,
        responseStatus: 201,
        responseBody: body,
      })
      return reply.status(201).send(body)
    },
  )
}

export default fxRoutes
