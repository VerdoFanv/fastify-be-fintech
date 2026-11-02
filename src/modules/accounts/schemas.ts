import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const accountSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  ledgerAccountId: z.string(),
  productType: z.enum(['CHECKING', 'SAVINGS']),
  currency: z.string(),
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']),
  balance: z.string(),
  accountNumber: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const openAccountBodySchema = z.object({
  productType: z.enum(['CHECKING', 'SAVINGS']),
  currency: z.string().length(3).default('IDR'),
  initialDeposit: z.string().optional(),
})

export const accountResponseSchema = withPerformanceSchema({
  account: accountSchema,
})

export const accountListResponseSchema = withPerformanceSchema({
  data: z.array(accountSchema),
})

export const freezeBodySchema = z.object({
  frozen: z.boolean(),
})

export type OpenAccountBody = z.infer<typeof openAccountBodySchema>
