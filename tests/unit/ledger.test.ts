import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors.js'
import { validateJournalLines } from '@/lib/ledger.js'

describe('ledger journal validation', () => {
  it('accepts balanced debit/credit pairs', () => {
    const lines = validateJournalLines([
      { ledgerAccountId: 'a', debit: '100' },
      { ledgerAccountId: 'b', credit: '100' },
    ])
    expect(lines).toHaveLength(2)
  })

  it('rejects unbalanced journals', () => {
    expect(() =>
      validateJournalLines([
        { ledgerAccountId: 'a', debit: '100' },
        { ledgerAccountId: 'b', credit: '90' },
      ]),
    ).toThrow(AppError)
  })

  it('rejects lines with both debit and credit', () => {
    expect(() =>
      validateJournalLines([
        { ledgerAccountId: 'a', debit: '50', credit: '50' },
        { ledgerAccountId: 'b', credit: '50' },
      ]),
    ).toThrow(AppError)
  })
})
