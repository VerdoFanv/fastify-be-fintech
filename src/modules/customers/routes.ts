import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertAdmin, assertCustomerOwner, requireCustomerForUser } from '@/lib/authz.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  customerListResponseSchema,
  customerResponseSchema,
  listQuerySchema,
  updateCustomerBodySchema,
} from './schemas.js'
import {
  getCustomerById,
  getCustomerByUserId,
  listCustomers,
  updateCustomer,
} from './service.js'

const customersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get(
    '/customers/me',
    {
      schema: {
        tags: ['Customers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: customerResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'customers.me.load')
      const customer = await getCustomerByUserId(fastify.prisma, request.user.sub)
      return withPerformance(request, { customer })
    },
  )

  fastify.patch(
    '/customers/me',
    {
      schema: {
        tags: ['Customers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: updateCustomerBodySchema,
        response: { 200: customerResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'customers.me.update')
      const mine = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const customer = await updateCustomer(fastify.prisma, mine.id, request.body)
      return withPerformance(request, { customer })
    },
  )

  fastify.get(
    '/customers',
    {
      schema: {
        tags: ['Customers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        querystring: listQuerySchema,
        response: { 200: customerListResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'customers.list')
      const { page, limit } = request.query
      const result = await listCustomers(fastify.prisma, page, limit)
      return withPerformance(request, {
        data: result.data,
        meta: { page, limit, total: result.total },
      })
    },
  )

  fastify.get(
    '/customers/:id',
    {
      schema: {
        tags: ['Customers'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: customerResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'customers.get')
      const customer = await getCustomerById(fastify.prisma, request.params.id)
      assertCustomerOwner(customer, request.user)
      return withPerformance(request, { customer })
    },
  )
}

export default customersRoutes
