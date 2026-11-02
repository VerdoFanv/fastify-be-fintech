import { describe, expect, it } from 'vitest'
import { buildApp } from '@/app.js'

describe('HTTP Security Headers (Helmet)', () => {
  it('attaches HSTS, NoSniff, and Frameguard headers to responses', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)

    const headers = response.headers
    // Strict-Transport-Security
    expect(headers['strict-transport-security']).toBeDefined()
    expect(headers['strict-transport-security']).toContain('max-age=31536000')

    // X-Content-Type-Options: nosniff
    expect(headers['x-content-type-options']).toBe('nosniff')

    // X-Frame-Options: DENY
    expect(headers['x-frame-options']).toBe('DENY')

    // Content-Security-Policy
    expect(headers['content-security-policy']).toBeDefined()

    await app.close()
  })
})

