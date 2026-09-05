import { describe, expect, it } from 'vitest'
import { calculateScaledBatch, formatBatchWeight, isScaleBatchEligible } from '../src/services/scaleBatch'
import type { FormulaSnapshotRow } from '../src/models/formula'
const row = (rowId: string, parts: number | '', material = rowId): FormulaSnapshotRow => ({ rowId, parts, material })
describe('Scale Batch: selected snapshot physical weights', () => {
  it.each([10, 30])('scales complete formula to %sg', amount => {
    const result = calculateScaledBatch([row('Hedione', 320), row('Iso E Super', 200), row('rest', 480)], amount)!
    expect(result.totalGrams).toBe(amount)
    expect(result.rows[0].grams).toBe(320 / 1000 * amount)
    expect(result.rows[1].grams).toBe(200 / 1000 * amount)
  })
  it.each([[1000, true], [999, false], [1001, false], [740, false]] as const)('eligibility %s = %s', (parts, eligible) => {
    expect(isScaleBatchEligible([row('a', parts)])).toBe(eligible)
    expect(calculateScaledBatch([row('a', parts)], 30) !== null).toBe(eligible)
  })
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid amount %s', amount => {
    expect(calculateScaledBatch([row('a', 1000)], amount)).toBeNull()
  })
  it('preserves order, source identity, exact names and dilution references without mutation', () => {
    const dilution = Object.freeze({ enabled: true, percent: 10, solvent: 'DPG' })
    const rows = [row('h', 320, 'Hedione'), row('i', 200, 'Iso E Super'), { ...row('l', 100, 'Linalool'), dilution }, row('d', 100, 'DPG'), row('tiny', 1), row('rest', 279), row('placeholder', '', '')]
    const before = JSON.stringify(rows)
    rows.forEach(Object.freeze); Object.freeze(rows)
    const result = calculateScaledBatch(rows, 30)!
    expect(result.rows.map(r => r.sourceRowId)).toEqual(['h', 'i', 'l', 'd', 'tiny', 'rest'])
    expect(result.rows.map(r => r.grams)).toEqual([9.6, 6, 3, 3, 0.03, 8.370000000000001])
    expect(result.rows[2].dilution).toBe(dilution)
    expect(result.rows[2].material).toBe('Linalool')
    expect(JSON.stringify(rows)).toBe(before)
    expect(calculateScaledBatch(rows, 5)!.rows[4].grams).toBe(0.005)
  })
  it('retains unnamed numeric rows according to existing semantics', () => {
    expect(calculateScaledBatch([row('a', 1000, '')], 10)!.rows[0].grams).toBe(10)
  })
  it('formats only at display and does not sum rounded rows for total', () => {
    for (const [n, expected] of [[9.6,'9.60'],[3,'3.00'],[0.125,'0.125'],[0.005,'0.005'],[0.1234,'0.123']] as const) expect(formatBatchWeight(n,'en')).toBe(expected)
    const result = calculateScaledBatch([row('a',333),row('b',333),row('c',334)], 0.01)!
    expect(result.totalGrams).toBe(0.01)
    expect(result.rows[0].grams).toBe(0.00333)
  })
})
