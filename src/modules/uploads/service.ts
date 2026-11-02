import { randomUUID } from 'node:crypto'
import type { KycDocument, KycDocumentType, PrismaClient } from '@/generated/prisma/client.js'
import { env } from '@/config/env.js'
import { badRequest } from '@/lib/errors.js'
import { objectUrl, uploadObject } from '@/lib/s3.js'
import { createKycDocument } from '@/modules/kyc/service.js'

export async function uploadKycFile(
  prisma: PrismaClient,
  customerId: string,
  type: KycDocumentType,
  file: { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> },
): Promise<{ document: KycDocument; url: string }> {
  if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
    throw badRequest('Only image or PDF KYC documents are allowed')
  }

  const buffer = await file.toBuffer()
  const key = `kyc/${customerId}/${type}/${randomUUID()}-${file.filename}`
  await uploadObject({
    key,
    body: buffer,
    contentType: file.mimetype,
  })

  const document = await createKycDocument(prisma, customerId, {
    type,
    key,
    bucket: env.S3_BUCKET,
    contentType: file.mimetype,
    size: buffer.length,
  })

  return { document, url: objectUrl(key) }
}
