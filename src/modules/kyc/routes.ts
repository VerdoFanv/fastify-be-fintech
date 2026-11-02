import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertAdmin, assertCustomerOwner, requireCustomerForUser } from '@/lib/authz.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  kycDocumentResponseSchema,
  kycListResponseSchema,
  reviewBodySchema,
} from './schemas.js'
import { listKycDocuments, reviewKycDocument } from './service.js'

const kycRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get(
    '/kyc/documents',
    {
      schema: {
        tags: ['KYC'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: kycListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'kyc.list')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const result = await listKycDocuments(fastify.prisma, customer.id)
      return withPerformance(request, {
        data: result.data,
        customerKycStatus: result.customer.kycStatus,
      })
    },
  )

  fastify.get(
    '/kyc/customers/:customerId/documents',
    {
      schema: {
        tags: ['KYC'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ customerId: z.string() }),
        response: { 200: kycListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'kyc.list.admin')
      const result = await listKycDocuments(fastify.prisma, request.params.customerId)
      assertCustomerOwner(result.customer, request.user)
      return withPerformance(request, {
        data: result.data,
        customerKycStatus: result.customer.kycStatus,
      })
    },
  )

  fastify.post(
    '/kyc/documents/:id/review',
    {
      schema: {
        tags: ['KYC'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: reviewBodySchema,
        response: { 200: kycDocumentResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'kyc.review')
      const result = await reviewKycDocument(fastify.prisma, request.params.id, request.body, {
        actorUserId: request.user.sub,
        requestId: request.requestId,
      })
      return withPerformance(request, { document: result.document })
    },
  )
}

export default kycRoutes
