import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { assertAdmin, assertCustomerOwner, requireCustomerForUser } from '@/lib/authz.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  accountListResponseSchema,
  accountResponseSchema,
  freezeBodySchema,
  openAccountBodySchema,
} from './schemas.js'
import {
  getAccount,
  listAccountsForCustomer,
  openAccount,
  setAccountFrozen,
  toAccountDto,
} from './service.js'

const accountsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/accounts',
    {
      schema: {
        tags: ['Accounts'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: openAccountBodySchema,
        response: { 201: accountResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'accounts.open')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const account = await openAccount(fastify.prisma, customer.id, request.body)
      return reply.status(201).send(withPerformance(request, { account: toAccountDto(account) }))
    },
  )

  fastify.get(
    '/accounts',
    {
      schema: {
        tags: ['Accounts'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: accountListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'accounts.list')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const accounts = await listAccountsForCustomer(fastify.prisma, customer.id)
      return withPerformance(request, { data: accounts.map(toAccountDto) })
    },
  )

  fastify.get(
    '/accounts/:id',
    {
      schema: {
        tags: ['Accounts'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: accountResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'accounts.get')
      const account = await getAccount(fastify.prisma, request.params.id)
      const owner = await fastify.prisma.customer.findUniqueOrThrow({
        where: { id: account.customerId },
      })
      assertCustomerOwner(owner, request.user)
      return withPerformance(request, { account: toAccountDto(account) })
    },
  )

  fastify.post(
    '/accounts/:id/freeze',
    {
      schema: {
        tags: ['Accounts'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: freezeBodySchema,
        response: { 200: accountResponseSchema },
      },
    },
    async (request) => {
      assertAdmin(request.user.role)
      trackProcess(request, 'accounts.freeze')
      const account = await setAccountFrozen(fastify.prisma, request.params.id, request.body.frozen)
      return withPerformance(request, { account: toAccountDto(account) })
    },
  )
}

export default accountsRoutes
