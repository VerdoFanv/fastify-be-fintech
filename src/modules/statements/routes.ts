import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertCustomerOwner } from '@/lib/authz.js'
import { moneyToString } from '@/lib/money.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import { statementQuerySchema, statementResponseSchema } from './schemas.js'
import { getAccountStatement } from './service.js'

const statementsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get(
    '/accounts/:id/statement',
    {
      schema: {
        tags: ['Statements'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        querystring: statementQuerySchema,
        response: { 200: statementResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'statements.get')
      const { page, limit, from, to } = request.query
      const result = await getAccountStatement(
        fastify.prisma,
        request.params.id,
        page,
        limit,
        from,
        to,
      )
      const owner = await fastify.prisma.customer.findUniqueOrThrow({
        where: { id: result.account.customerId },
      })
      assertCustomerOwner(owner, request.user)
      return withPerformance(request, {
        accountId: result.account.id,
        balance: moneyToString(result.account.balance),
        data: result.data,
        meta: { page, limit, total: result.total },
      })
    },
  )
}

export default statementsRoutes
