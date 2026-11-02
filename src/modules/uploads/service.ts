import { randomUUID } from 'node:crypto'
import type { KycDocument, KycDocumentType, PrismaClient } from '@/generated/prisma/client.js'
import { env } from '@/config/env.js'
import { badRequest } from '@/lib/errors.js'
import { getPresignedKycUrl, uploadObject } from '@/lib/s3.js'
import { createKycDocument } from '@/modules/kyc/service.js'

export function validateFileMagicBytes(buffer: Buffer, mimetype: string): void {
  if (buffer.length < 4) {
    throw badRequest('Uploaded file is too small or corrupted')
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  // PDF starts with '%PDF-' (0x25, 0x50, 0x44, 0x46)
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46

  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    if (!isJpeg) throw badRequest('File content does not match JPEG image signature')
  } else if (mimetype === 'image/png') {
    if (!isPng) throw badRequest('File content does not match PNG image signature')
  } else if (mimetype === 'application/pdf') {
    if (!isPdf) throw badRequest('File content does not match PDF document signature')
  } else if (!isJpeg && !isPng && !isPdf) {
    throw badRequest('Only genuine JPEG, PNG, or PDF files are allowed for KYC verification')
  }
}

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
  validateFileMagicBytes(buffer, file.mimetype)

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `kyc/${customerId}/${type}/${randomUUID()}-${sanitizedFilename}`

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

  // Return temporary presigned URL (5-min expiry) instead of exposing public raw S3 URL
  const presignedUrl = await getPresignedKycUrl(key, 300)
  return { document, url: presignedUrl }
}
