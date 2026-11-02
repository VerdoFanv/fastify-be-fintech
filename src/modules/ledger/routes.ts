import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertAdmin } from '@/lib/authz.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  chartResponseSchema,
  journalListQuerySchema,
  journalListResponseSchema,
  journalResponseSchema,
} from './schemas.js'
import { getJournal, listChart, listJournals, toJournalDto, toLedgerAccountDto } from './service.js'

const ledgerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get(
    '/ledger/accounts',
    {
      schema: {
        tags: ['Ledger'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: chartResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'ledger.chart')
      const data = await listChart(fastify.prisma)
      return withPerformance(request, { data: data.map(toLedgerAccountDto) })
    },
  )

  fastify.get(
    '/ledger/journals',
    {
      schema: {
        tags: ['Ledger'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        querystring: journalListQuerySchema,
        response: { 200: journalListResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'ledger.journals.list')
      const { page, limit } = request.query
      const result = await listJournals(fastify.prisma, page, limit)
      return withPerformance(request, {
        data: result.data.map(toJournalDto),
        meta: { page, limit, total: result.total },
      })
    },
  )

  fastify.get(
    '/ledger/journals/:id',
    {
      schema: {
        tags: ['Ledger'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: journalResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'ledger.journals.get')
      const journal = await getJournal(fastify.prisma, request.params.id)
      return withPerformance(request, { journal: toJournalDto(journal) })
    },
  )
}

export default ledgerRoutes
