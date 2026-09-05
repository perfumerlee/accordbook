import { describe, expect, it } from 'vitest'
import { batchInput, changeBatchUnit, fromCanonicalGrams, toCanonicalGrams } from '../src/services/batchUnits'
import { calculateScaledBatch } from '../src/services/scaleBatch'

describe('batch input units', () => {
  it.each([[10, 'g', 10], [1, 'kg', 1000], [30, 'kg', 30000], [0.5, 'kg', 500], [1.25, 'kg', 1250], [2.75, 'kg', 2750]] as const)('%s %s becomes %s canonical grams', (value, unit, expected) => {
    expect(toCanonicalGrams(value, unit)).toBe(expected)
  })
  it('converts display units without changing mass or derived weights', () => {
    const rows = [{ rowId: 'h', material: 'Hedione', parts: 320 }, { rowId: 'r', material: 'Rest', parts: 680 }]
    const input = batchInput('1000')
    const kg = changeBatchUnit(input, 'kg')
    expect(kg).toEqual({ amount: '1', unit: 'kg', canonicalGrams: 1000 })
    expect(calculateScaledBatch(rows, kg.canonicalGrams!)!.rows[0].grams).toBe(320)
    expect(changeBatchUnit(batchInput('30', 'kg'), 'g').amount).toBe('30000')
    expect(changeBatchUnit(batchInput(), 'kg').amount).toBe('0.01')
    expect(fromCanonicalGrams(1000, 'kg')).toBe(1)
    expect(input.amount).toBe('1000')
  })
  it('does not accumulate rounding across repeated toggles', () => {
    let input = batchInput('0.123456789123456')
    const original = input.canonicalGrams
    for (let i = 0; i < 100; i++) input = changeBatchUnit(input, input.unit === 'g' ? 'kg' : 'g')
    expect(input.canonicalGrams).toBe(original)
  })
  it('preserves empty input and handles invalid canonical amounts', () => {
    expect(changeBatchUnit(batchInput(''), 'kg')).toEqual({ amount: '', unit: 'kg', canonicalGrams: null })
    expect(batchInput('NaN', 'kg').canonicalGrams).toBeNull()
    expect(batchInput('1e308', 'kg').canonicalGrams).toBeNull()
    for (const amount of ['0', '-1']) expect(batchInput(amount, 'kg').canonicalGrams!).toBeLessThanOrEqual(0)
  })
  it('scales 30kg through the unchanged grams core', () => {
    const rows = [{ rowId: 'h', material: 'Hedione', parts: 320 }, { rowId: 'i', material: 'Iso E Super', parts: 200 }, { rowId: 't', material: 'Trace', parts: 1 }, { rowId: 'r', material: 'Rest', parts: 479 }]
    const result = calculateScaledBatch(rows, toCanonicalGrams(30, 'kg'))!
    expect(result.rows.map(row => row.grams)).toEqual([9600, 6000, 30, 14370])
    expect(fromCanonicalGrams(result.totalGrams, 'kg')).toBe(30)
  })
})
