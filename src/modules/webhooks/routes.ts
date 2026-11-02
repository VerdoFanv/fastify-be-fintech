import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  registerWebhookBodySchema,
  webhookDeliveryListResponseSchema,
  webhookDeliveryResponseSchema,
  webhookEndpointListResponseSchema,
  webhookEndpointResponseSchema,
} from './schemas.js'
import { listDeliveries, listWebhooks, registerWebhook, retryDelivery } from './service.js'

const webhooksRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/webhooks/endpoints',
    {
      schema: {
        tags: ['Webhooks'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: registerWebhookBodySchema,
        response: { 201: webhookEndpointResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'webhooks.register')
      const endpoint = await registerWebhook(fastify.prisma, request.user.sub, request.body)
      return reply.status(201).send(withPerformance(request, { endpoint }))
    },
  )

  fastify.get(
    '/webhooks/endpoints',
    {
      schema: {
        tags: ['Webhooks'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: webhookEndpointListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'webhooks.list')
      const data = await listWebhooks(fastify.prisma, request.user.sub)
      return withPerformance(request, { data })
    },
  )

  fastify.get(
    '/webhooks/deliveries',
    {
      schema: {
        tags: ['Webhooks'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        querystring: z.object({
          endpointId: z.string().optional(),
        }),
        response: { 200: webhookDeliveryListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'webhooks.deliveries')
      const data = await listDeliveries(
        fastify.prisma,
        request.user.sub,
        request.query.endpointId,
      )
      return withPerformance(request, { data })
    },
  )

  fastify.post(
    '/webhooks/deliveries/:id/retry',
    {
      schema: {
        tags: ['Webhooks'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: webhookDeliveryResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'webhooks.retry')
      const delivery = await retryDelivery(fastify.prisma, request.user.sub, request.params.id)
      return withPerformance(request, { delivery })
    },
  )
}

export default webhooksRoutes
