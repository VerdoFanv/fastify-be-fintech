import { z } from 'zod'
import { withPerformanceSchema } from '@/lib/response-meta.js'
import { kycDocumentSchema } from '@/modules/kyc/schemas.js'

export const uploadTypeQuerySchema = z.object({
  type: z.enum(['ID_CARD', 'SELFIE', 'PROOF_OF_ADDRESS']),
})

export const uploadResponseSchema = withPerformanceSchema({
  document: kycDocumentSchema,
  url: z.string(),
})
