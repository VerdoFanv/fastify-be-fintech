import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const ledgerAccountSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  currency: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const journalLineSchema = z.object({
  id: z.string(),
  ledgerAccountId: z.string(),
  debit: z.string(),
  credit: z.string(),
})

export const journalEntrySchema = z.object({
  id: z.string(),
  reference: z.string(),
  description: z.string().nullable(),
  postedAt: z.coerce.date(),
  lines: z.array(journalLineSchema),
})

export const chartResponseSchema = withPerformanceSchema({
  data: z.array(ledgerAccountSchema),
})

export const journalResponseSchema = withPerformanceSchema({
  journal: journalEntrySchema,
})

export const journalListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const journalListResponseSchema = withPerformanceSchema({
  data: z.array(journalEntrySchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
})
