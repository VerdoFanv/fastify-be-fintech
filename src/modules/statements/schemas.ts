import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const statementLineSchema = z.object({
  journalEntryId: z.string(),
  postedAt: z.coerce.date(),
  reference: z.string(),
  description: z.string().nullable(),
  debit: z.string(),
  credit: z.string(),
})

export const statementQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const statementResponseSchema = withPerformanceSchema({
  accountId: z.string(),
  balance: z.string(),
  data: z.array(statementLineSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
})
