import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'
import { conflict } from '@/lib/errors.js'

/*
  Idempotency-Key pattern (payments / transfers):
  - Client retries with the same key after network failure must get the SAME response,
    not a second money movement.
  - Same key + different body hash → 409 Conflict (client bug or key reuse).
  - Scoped per user + method + path so keys do not collide across endpoints.
*/
export function hashRequestPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export async function findIdempotentResponse(
  prisma: PrismaClient,
  params: { userId: string; key: string; method: string; path: string; requestHash: string },
): Promise<{ status: number; body: unknown } | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      userId_key_method_path: {
        userId: params.userId,
        key: params.key,
        method: params.method,
        path: params.path,
      },
    },
  })

  if (!existing) {
    return null
  }

  if (existing.requestHash !== params.requestHash) {
    throw conflict('Idempotency-Key reused with a different request payload')
  }

  return {
    status: existing.responseStatus,
    body: existing.responseBody,
  }
}

export async function saveIdempotentResponse(
  prisma: PrismaClient,
  params: {
    userId: string
    key: string
    method: string
    path: string
    requestHash: string
    responseStatus: number
    responseBody: Prisma.InputJsonValue
  },
): Promise<void> {
  await prisma.idempotencyKey.create({
    data: {
      userId: params.userId,
      key: params.key,
      method: params.method,
      path: params.path,
      requestHash: params.requestHash,
      responseStatus: params.responseStatus,
      responseBody: params.responseBody,
    },
  })
}

export function readIdempotencyKey(header: string | string[] | undefined): string | undefined {
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim()
  }
  return undefined
}
