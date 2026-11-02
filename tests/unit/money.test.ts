import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors.js'
import { assertPositive, money, moneyEquals, moneyToString, sumMoney } from '@/lib/money.js'

describe('money helpers', () => {
  it('parses decimal strings exactly', () => {
    expect(moneyToString(money('0.1000'))).toBe('0.1000')
    expect(moneyEquals(money('0.1'), money('0.10'))).toBe(true)
  })

  it('rejects invalid amounts', () => {
    expect(() => money('abc')).toThrow(AppError)
  })

  it('assertPositive rejects zero and negative', () => {
    expect(() => assertPositive(money(0))).toThrow(AppError)
    expect(() => assertPositive(money('-1'))).toThrow(AppError)
  })

  it('sums without float drift', () => {
    const total = sumMoney([money('0.1'), money('0.2')])
    expect(moneyToString(total)).toBe('0.3000')
  })
})
