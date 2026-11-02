import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { Prisma, PrismaClient } from '@/generated/prisma/client.js'
import { conflict } from '@/lib/errors.js'

/*
  Idempotency-Key pattern (payments / transfers):
  - Client retries with the same key after network failure must get the SAME response,
    not a second money movement.
  - Same key + different body hash → 409 Conflict (client bug or key reuse).
  - Scoped per user + method + path so keys do not collide across endpoints.
  - Distributed lock prevents concurrent duplicate executions in-flight before commit.
*/
export function hashRequestPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// In-memory fallback lock set when Redis is not available (e.g. unit tests)
const inMemoryLocks = new Set<string>()

export async function acquireIdempotencyLock(
  redis: Redis | null | undefined,
  userId: string,
  key: string,
  ttlMs = 30000,
): Promise<boolean> {
  const lockKey = `fintech:idemp-lock:${userId}:${key}`
  if (redis) {
    const res = await redis.set(lockKey, '1', 'PX', ttlMs, 'NX')
    return res === 'OK'
  }

  if (inMemoryLocks.has(lockKey)) {
    return false
  }
  inMemoryLocks.add(lockKey)
  setTimeout(() => inMemoryLocks.delete(lockKey), ttlMs).unref?.()
  return true
}

export async function releaseIdempotencyLock(
  redis: Redis | null | undefined,
  userId: string,
  key: string,
): Promise<void> {
  const lockKey = `fintech:idemp-lock:${userId}:${key}`
  if (redis) {
    await redis.del(lockKey).catch(() => {})
  } else {
    inMemoryLocks.delete(lockKey)
  }
}

export async function findIdempotentResponse(
  prisma: PrismaClient | Prisma.TransactionClient,
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
  prisma: PrismaClient | Prisma.TransactionClient,
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
