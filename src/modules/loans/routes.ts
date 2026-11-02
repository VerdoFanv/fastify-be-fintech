import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertAdmin, assertCustomerOwner, requireCustomerForUser } from '@/lib/authz.js'
import { badRequest } from '@/lib/errors.js'
import {
  findIdempotentResponse,
  hashRequestPayload,
  readIdempotencyKey,
  saveIdempotentResponse,
} from '@/lib/idempotency.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  applyLoanBodySchema,
  loanListResponseSchema,
  loanResponseSchema,
  repayBodySchema,
} from './schemas.js'
import {
  applyLoan,
  approveLoan,
  disburseLoan,
  getLoan,
  listLoans,
  rejectLoan,
  repayLoanInstallment,
  toLoanDto,
} from './service.js'

const loansRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/loans',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: applyLoanBodySchema,
        response: { 201: loanResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'loans.apply')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const loan = await applyLoan(fastify.prisma, customer.id, request.body)
      return reply.status(201).send(withPerformance(request, { loan: toLoanDto(loan) }))
    },
  )

  fastify.get(
    '/loans',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: loanListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'loans.list')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const loans = await listLoans(fastify.prisma, customer.id)
      return withPerformance(request, { data: loans.map(toLoanDto) })
    },
  )

  fastify.get(
    '/loans/:id',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: loanResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'loans.get')
      const loan = await getLoan(fastify.prisma, request.params.id)
      const owner = await fastify.prisma.customer.findUniqueOrThrow({
        where: { id: loan.customerId },
      })
      assertCustomerOwner(owner, request.user)
      return withPerformance(request, { loan: toLoanDto(loan) })
    },
  )

  fastify.post(
    '/loans/:id/approve',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: loanResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'loans.approve')
      const loan = await approveLoan(fastify.prisma, request.params.id)
      return withPerformance(request, { loan: toLoanDto(loan) })
    },
  )

  fastify.post(
    '/loans/:id/reject',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: loanResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'loans.reject')
      const loan = await rejectLoan(fastify.prisma, request.params.id)
      return withPerformance(request, { loan: toLoanDto(loan) })
    },
  )

  fastify.post(
    '/loans/:id/disburse',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: loanResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'loans.disburse')
      const loan = await disburseLoan(fastify.prisma, request.params.id, {
        actorUserId: request.user.sub,
        requestId: request.requestId,
      })
      return withPerformance(request, { loan: toLoanDto(loan) })
    },
  )

  fastify.post(
    '/loans/:id/repay',
    {
      schema: {
        tags: ['Loans'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: repayBodySchema,
        response: { 200: loanResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'loans.repay')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const idemKey = readIdempotencyKey(request.headers['idempotency-key'])
      if (!idemKey) {
        throw badRequest('Idempotency-Key header is required for loan repayments')
      }

      const path = `/loans/${request.params.id}/repay`
      const requestHash = hashRequestPayload(request.body)
      const cached = await findIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path,
        requestHash,
      })
      if (cached) {
        return reply.status(cached.status as 200).send(cached.body as never)
      }

      const loan = await repayLoanInstallment(
        fastify.prisma,
        customer.id,
        request.params.id,
        request.body,
        { actorUserId: request.user.sub, requestId: request.requestId },
      )
      const body = withPerformance(request, { loan: toLoanDto(loan) })
      await saveIdempotentResponse(fastify.prisma, {
        userId: request.user.sub,
        key: idemKey,
        method: 'POST',
        path,
        requestHash,
        responseStatus: 200,
        responseBody: body,
      })
      return body
    },
  )
}

export default loansRoutes
