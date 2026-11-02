import type { Customer, KycDocument, KycDocumentType, PrismaClient } from '@/generated/prisma/client.js'
import { badRequest, notFound } from '@/lib/errors.js'
import { emitDomainEvent } from '@/lib/events.js'
import { DOMAIN_TOPICS } from '@/lib/kafka.js'
import type { ReviewBody } from './schemas.js'

export async function createKycDocument(
  prisma: PrismaClient,
  customerId: string,
  data: {
    type: KycDocumentType
    key: string
    bucket: string
    contentType: string
    size: number
  },
): Promise<KycDocument> {
  const doc = await prisma.kycDocument.create({
    data: {
      customerId,
      type: data.type,
      key: data.key,
      bucket: data.bucket,
      contentType: data.contentType,
      size: data.size,
      status: 'PENDING',
    },
  })

  /*
    KYC state machine (customer level):
    NONE → PENDING when first doc submitted;
    APPROVED/REJECTED set only via admin review (never auto from upload).
  */
  await prisma.customer.update({
    where: { id: customerId },
    data: { kycStatus: 'PENDING' },
  })

  return doc
}

export async function listKycDocuments(
  prisma: PrismaClient,
  customerId: string,
): Promise<{ data: KycDocument[]; customer: Customer }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer) {
    throw notFound('Customer not found')
  }
  const data = await prisma.kycDocument.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  })
  return { data, customer }
}

export async function reviewKycDocument(
  prisma: PrismaClient,
  documentId: string,
  input: ReviewBody,
  meta?: { actorUserId?: string; requestId?: string },
): Promise<{ document: KycDocument; customer: Customer }> {
  const document = await prisma.kycDocument.findUnique({ where: { id: documentId } })
  if (!document) {
    throw notFound('KYC document not found')
  }
  if (document.status !== 'PENDING') {
    throw badRequest('Only PENDING documents can be reviewed')
  }

  const updatedDoc = await prisma.kycDocument.update({
    where: { id: documentId },
    data: {
      status: input.status,
      reviewNote: input.reviewNote,
    },
  })

  const customer = await prisma.customer.update({
    where: { id: document.customerId },
    data: { kycStatus: input.status },
  })

  await emitDomainEvent(prisma, {
    topic: DOMAIN_TOPICS.KYC_REVIEWED,
    action: 'kyc.reviewed',
    resourceType: 'KycDocument',
    resourceId: updatedDoc.id,
    actorUserId: meta?.actorUserId,
    requestId: meta?.requestId,
    data: {
      documentId: updatedDoc.id,
      customerId: customer.id,
      status: updatedDoc.status,
    },
  })

  return { document: updatedDoc, customer }
}
