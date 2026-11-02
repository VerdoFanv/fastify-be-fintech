import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const customerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  kycStatus: z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const updateCustomerBodySchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().min(6).max(32).nullable().optional(),
})

export const customerResponseSchema = withPerformanceSchema({
  customer: customerSchema,
})

export const customerListResponseSchema = withPerformanceSchema({
  data: z.array(customerSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
})

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>
