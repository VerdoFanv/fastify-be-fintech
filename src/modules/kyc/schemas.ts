import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'

export const kycDocumentSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  type: z.enum(['ID_CARD', 'SELFIE', 'PROOF_OF_ADDRESS']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  key: z.string(),
  bucket: z.string(),
  contentType: z.string(),
  size: z.number(),
  reviewNote: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const reviewBodySchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().max(500).optional(),
})

export const kycDocumentResponseSchema = withPerformanceSchema({
  document: kycDocumentSchema,
})

export const kycListResponseSchema = withPerformanceSchema({
  data: z.array(kycDocumentSchema),
  customerKycStatus: z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']),
})

export type ReviewBody = z.infer<typeof reviewBodySchema>
