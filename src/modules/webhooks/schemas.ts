import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  secret: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const webhookDeliverySchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  event: z.string(),
  payload: z.unknown(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
  attempts: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const registerWebhookBodySchema = z.object({
  url: z.url(),
  secret: z.string().min(8).max(128),
  events: z.array(z.string().min(1)).min(1),
})

export const webhookEndpointResponseSchema = withPerformanceSchema({
  endpoint: webhookEndpointSchema,
})

export const webhookEndpointListResponseSchema = withPerformanceSchema({
  data: z.array(webhookEndpointSchema),
})

export const webhookDeliveryListResponseSchema = withPerformanceSchema({
  data: z.array(webhookDeliverySchema),
})

export const webhookDeliveryResponseSchema = withPerformanceSchema({
  delivery: webhookDeliverySchema,
})

export type RegisterWebhookBody = z.infer<typeof registerWebhookBodySchema>
