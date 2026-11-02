import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const transferSchema = z.object({
  id: z.string(),
  fromCustomerId: z.string(),
  toCustomerId: z.string(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(['PENDING', 'POSTED', 'FAILED']),
  description: z.string().nullable(),
  journalEntryId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const createTransferBodySchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.string().min(1),
  description: z.string().max(240).optional(),
})

export const transferResponseSchema = withPerformanceSchema({
  transfer: transferSchema,
})

export const transferListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const transferListResponseSchema = withPerformanceSchema({
  data: z.array(transferSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
})

export type CreateTransferBody = z.infer<typeof createTransferBodySchema>
