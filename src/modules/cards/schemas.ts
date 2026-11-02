import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const cardSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  accountId: z.string(),
  type: z.enum(['VIRTUAL', 'PHYSICAL']),
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']),
  last4: z.string(),
  expiryMonth: z.number(),
  expiryYear: z.number(),
  spendingLimit: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const issueCardBodySchema = z.object({
  accountId: z.string(),
  type: z.enum(['VIRTUAL', 'PHYSICAL']).default('VIRTUAL'),
  spendingLimit: z.string().default('5000000.0000'),
})

export const cardResponseSchema = withPerformanceSchema({
  card: cardSchema,
})

export const cardListResponseSchema = withPerformanceSchema({
  data: z.array(cardSchema),
})

export const freezeCardBodySchema = z.object({
  frozen: z.boolean(),
})

export type IssueCardBody = z.infer<typeof issueCardBodySchema>
