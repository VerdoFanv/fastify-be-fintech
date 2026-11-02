import { describe, expect, it, vi } from 'vitest'
import { writeAuditLog } from '@/lib/audit.js'

describe('audit log writer', () => {
  it('persists audit rows via prisma', async () => {
    const create = vi.fn(async () => ({ id: 'a1' }))
    const prisma = { auditLog: { create } }

    await writeAuditLog(prisma as never, {
      action: 'transfer.posted',
      resourceType: 'Transfer',
      resourceId: 't1',
      requestId: 'r1',
      metadata: { amount: '1' },
    })

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        action: 'transfer.posted',
        resourceType: 'Transfer',
        resourceId: 't1',
        requestId: 'r1',
      },
    })
  })
})
