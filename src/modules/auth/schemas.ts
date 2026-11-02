import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const userPublicSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  role: z.enum(['CUSTOMER', 'ADMIN']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const registerBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
  fullName: z.string().min(1).max(120),
  phone: z.string().min(6).max(32).optional(),
})

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export const authResponseSchema = withPerformanceSchema({
  user: userPublicSchema,
  token: z.string(),
})

export const meResponseSchema = withPerformanceSchema({
  user: userPublicSchema,
})

export type RegisterBody = z.infer<typeof registerBodySchema>
export type LoginBody = z.infer<typeof loginBodySchema>
