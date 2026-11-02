import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const fxRateSchema = z.object({
  id: z.string(),
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  rate: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const upsertRateBodySchema = z.object({
  baseCurrency: z.string().length(3),
  quoteCurrency: z.string().length(3),
  rate: z.string(),
})

export const exchangeBodySchema = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  fromAmount: z.string(),
})

export const fxExchangeSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  fromAmount: z.string(),
  toAmount: z.string(),
  rate: z.string(),
  journalEntryId: z.string().nullable(),
  createdAt: z.coerce.date(),
})

export const fxRateResponseSchema = withPerformanceSchema({
  rate: fxRateSchema,
})

export const fxRateListResponseSchema = withPerformanceSchema({
  data: z.array(fxRateSchema),
})

export const fxExchangeResponseSchema = withPerformanceSchema({
  exchange: fxExchangeSchema,
})

export type UpsertRateBody = z.infer<typeof upsertRateBodySchema>
export type ExchangeBody = z.infer<typeof exchangeBodySchema>
