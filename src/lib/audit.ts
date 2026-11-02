import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'

/*
  Immutable audit rows for money/KYC actions — compliance baseline in mid-tier banking.
  Application writes only; no updates/deletes in normal flows.
*/
export async function writeAuditLog(
  prisma: PrismaClient,
  input: {
    actorUserId?: string | null
    action: string
    resourceType: string
    resourceId: string
    requestId?: string | null
    metadata?: Prisma.InputJsonValue
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? {},
    },
  })
}
