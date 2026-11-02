import { describe, expect, it } from 'vitest'
import { assertSafeWebhookUrl, isPrivateOrReservedIP } from '@/lib/ssrf.js'
import { AppError } from '@/lib/errors.js'

describe('SSRF protection', () => {
  it('correctly identifies private, loopback, and metadata IPs', () => {
    // IPv4 private & loopback
    expect(isPrivateOrReservedIP('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIP('127.1.2.3')).toBe(true)
    expect(isPrivateOrReservedIP('10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIP('10.255.255.255')).toBe(true)
    expect(isPrivateOrReservedIP('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIP('172.31.255.255')).toBe(true)
    expect(isPrivateOrReservedIP('192.168.1.100')).toBe(true)
    expect(isPrivateOrReservedIP('169.254.169.254')).toBe(true)
    expect(isPrivateOrReservedIP('0.0.0.0')).toBe(true)

    // Public IPv4
    expect(isPrivateOrReservedIP('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIP('1.1.1.1')).toBe(false)
    expect(isPrivateOrReservedIP('104.26.10.1')).toBe(false)

    // IPv6
    expect(isPrivateOrReservedIP('::1')).toBe(true)
    expect(isPrivateOrReservedIP('fe80::1')).toBe(true)
  })

  it('blocks webhook URLs targeting private or cloud metadata IPs', async () => {
    await expect(assertSafeWebhookUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('http://127.0.0.1:3000/webhook')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('http://localhost:3000/webhook')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('http://10.0.1.5:8080/callback')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('http://postgres:5432')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('http://redis:6379')).rejects.toBeInstanceOf(AppError)
  })

  it('rejects invalid schemes', async () => {
    await expect(assertSafeWebhookUrl('ftp://example.com/webhook')).rejects.toBeInstanceOf(AppError)
    await expect(assertSafeWebhookUrl('file:///etc/passwd')).rejects.toBeInstanceOf(AppError)
  })
})

