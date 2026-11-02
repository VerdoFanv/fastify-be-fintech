import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireCustomerForUser } from '@/lib/authz.js'
import { badRequest, forbidden } from '@/lib/errors.js'
import {
  findIdempotentResponse,
  hashRequestPayload,
  readIdempotencyKey,
  saveIdempotentResponse,
} from '@/lib/idempotency.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  createTransferBodySchema,
  transferListQuerySchema,
  transferListResponseSchema,
  transferResponseSchema,
} from './schemas.js'
import { createTransfer, getTransfer, listTransfersForCustomer, toTransferDto } from './service.js'

const transfersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/transfers',
    {
      schema: {
        tags: ['Transfers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: createTransferBodySchema,
        response: { 201: transferResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'transfers.create')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const idemKey = readIdempotencyKey(request.headers['idempotency-key'])
      if (!idemKey) {
        throw badRequest('Idempotency-Key header is required for transfers')
      }

      const requestHash = hashRequestPayload(request.body)
      const cached = await findIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path: '/transfers',
        requestHash,
      })
      if (cached) {
        trackProcess(request, 'transfers.idempotent.hit')
        return reply.status(cached.status as 201).send(cached.body as never)
      }

      const transfer = await createTransfer(fastify.prisma, customer.id, request.body, idemKey, {
        actorUserId: request.user.sub,
        requestId: request.requestId,
      })
      const body = withPerformance(request, { transfer: toTransferDto(transfer) })
      await saveIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path: '/transfers',
        requestHash,
        responseStatus: 201,
        responseBody: body,
      })
      return reply.status(201).send(body)
    },
  )

  fastify.get(
    '/transfers',
    {
      schema: {
        tags: ['Transfers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        querystring: transferListQuerySchema,
        response: { 200: transferListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'transfers.list')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const { page, limit } = request.query
      const result = await listTransfersForCustomer(fastify.prisma, customer.id, page, limit)
      return withPerformance(request, {
        data: result.data.map(toTransferDto),
        meta: { page, limit, total: result.total },
      })
    },
  )

  fastify.get(
    '/transfers/:id',
    {
      schema: {
        tags: ['Transfers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: transferResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'transfers.get')
      const transfer = await getTransfer(fastify.prisma, request.params.id)
      if (request.user.role !== 'ADMIN') {
        const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
        if (
          transfer.fromCustomerId !== customer.id &&
          transfer.toCustomerId !== customer.id
        ) {
          throw forbidden('Not allowed to view this transfer')
        }
      }
      return withPerformance(request, { transfer: toTransferDto(transfer) })
    },
  )
}

export default transfersRoutes
