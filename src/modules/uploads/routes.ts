import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { requireCustomerForUser } from '@/lib/authz.js'
import { badRequest } from '@/lib/errors.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import { uploadResponseSchema, uploadTypeQuerySchema } from './schemas.js'
import { uploadKycFile } from './service.js'

const uploadsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/uploads/kyc',
    {
      schema: {
        tags: ['Uploads'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        querystring: uploadTypeQuerySchema,
        response: { 201: uploadResponseSchema },
        consumes: ['multipart/form-data'],
      },
    },
    async (request, reply) => {
      trackProcess(request, 'uploads.kyc')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const file = await request.file()
      if (!file) {
        throw badRequest('File is required')
      }
      const result = await uploadKycFile(
        fastify.prisma,
        customer.id,
        request.query.type,
        file,
      )
      return reply.status(201).send(
        withPerformance(request, {
          document: result.document,
          url: result.url,
        }),
      )
    },
  )
}

export default uploadsRoutes
