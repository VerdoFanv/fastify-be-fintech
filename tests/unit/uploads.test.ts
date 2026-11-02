import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors.js'
import { validateFileMagicBytes } from '@/modules/uploads/service.js'

describe('KYC upload magic bytes validation', () => {
  it('accepts valid JPEG buffer', () => {
    // JPEG starts with FF D8 FF
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(() => validateFileMagicBytes(jpegBuffer, 'image/jpeg')).not.toThrow()
  })

  it('accepts valid PNG buffer', () => {
    // PNG starts with 89 50 4E 47
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    expect(() => validateFileMagicBytes(pngBuffer, 'image/png')).not.toThrow()
  })

  it('accepts valid PDF buffer', () => {
    // PDF starts with %PDF- (0x25, 0x50, 0x44, 0x46)
    const pdfBuffer = Buffer.from('%PDF-1.4 simulated pdf document')
    expect(() => validateFileMagicBytes(pdfBuffer, 'application/pdf')).not.toThrow()
  })

  it('rejects spoofed file with fake mimetype', () => {
    // Attacker sends HTML / PHP script disguised as JPEG
    const maliciousBuffer = Buffer.from('<html><script>alert("xss")</script></html>')
    expect(() => validateFileMagicBytes(maliciousBuffer, 'image/jpeg')).toThrow(AppError)
  })

  it('rejects empty or truncated buffer', () => {
    const tinyBuffer = Buffer.from([0xff])
    expect(() => validateFileMagicBytes(tinyBuffer, 'image/jpeg')).toThrow(AppError)
  })
})

