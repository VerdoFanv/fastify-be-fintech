import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

export const performanceSchema = z.object({
  durationMs: z.number(),
  process: z.array(z.string()),
})

export type PerformanceInfo = z.infer<typeof performanceSchema>

export function withPerformanceSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    ...shape,
    performance: performanceSchema,
  })
}

export function trackProcess(request: FastifyRequest, step: string): void {
  request.processSteps.push(step)
}

export function buildPerformance(request: FastifyRequest): PerformanceInfo {
  const durationMs = Number(process.hrtime.bigint() - request.startedAt) / 1e6
  return {
    durationMs: Math.round(durationMs * 1000) / 1000,
    process: [...request.processSteps],
  }
}

export function withPerformance<T extends Record<string, unknown>>(
  request: FastifyRequest,
  payload: T,
): T & { performance: PerformanceInfo } {
  return {
    ...payload,
    performance: buildPerformance(request),
  }
}
