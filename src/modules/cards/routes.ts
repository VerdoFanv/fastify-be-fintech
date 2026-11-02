import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireCustomerForUser } from '@/lib/authz.js'
import { trackProcess, withPerformance } from '@/lib/response-meta.js'
import {
  cardListResponseSchema,
  cardResponseSchema,
  freezeCardBodySchema,
  issueCardBodySchema,
} from './schemas.js'
import { issueCard, listCards, setCardFrozen, toCardDto } from './service.js'

const cardsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post(
    '/cards',
    {
      schema: {
        tags: ['Cards'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        body: issueCardBodySchema,
        response: { 201: cardResponseSchema },
      },
    },
    async (request, reply) => {
      trackProcess(request, 'cards.issue')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const card = await issueCard(fastify.prisma, customer.id, request.body)
      return reply.status(201).send(withPerformance(request, { card: toCardDto(card) }))
    },
  )

  fastify.get(
    '/cards',
    {
      schema: {
        tags: ['Cards'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        response: { 200: cardListResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'cards.list')
      const customer = await requireCustomerForUser(fastify.prisma, request.user.sub)
      const cards = await listCards(fastify.prisma, customer.id)
      return withPerformance(request, { data: cards.map(toCardDto) })
    },
  )

  fastify.post(
    '/cards/:id/freeze',
    {
      schema: {
        tags: ['Cards'],
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: freezeCardBodySchema,
        response: { 200: cardResponseSchema },
      },
    },
    async (request) => {
      trackProcess(request, 'cards.freeze')
      const customer =
        request.user.role === 'ADMIN'
          ? null
          : await requireCustomerForUser(fastify.prisma, request.user.sub)
      const card = await setCardFrozen(
        fastify.prisma,
        request.params.id,
        customer?.id ?? null,
        request.body.frozen,
      )
      return withPerformance(request, { card: toCardDto(card) })
    },
  )
}

export default cardsRoutes
