import { describe, expect, it } from 'vitest'
import { hashRequestPayload, readIdempotencyKey } from '@/lib/idempotency.js'

describe('idempotency helpers', () => {
  it('hashes payloads stably', () => {
    expect(hashRequestPayload({ a: 1 })).toBe(hashRequestPayload({ a: 1 }))
    expect(hashRequestPayload({ a: 1 })).not.toBe(hashRequestPayload({ a: 2 }))
  })

  it('reads idempotency header', () => {
    expect(readIdempotencyKey(' abc ')).toBe('abc')
    expect(readIdempotencyKey(undefined)).toBeUndefined()
    expect(readIdempotencyKey(['x'])).toBeUndefined()
  })
})
