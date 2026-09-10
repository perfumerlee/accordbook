import { describe, expect, it } from 'vitest'
import type { FormulaSnapshotRow } from '../src/models/formula'
import type { Experiment } from '../src/models/experiment'
import { buildExperimentComparisonMatrix, experimentComparisonStates, getDefaultComparisonVariantIds, getOrderedComparisonVariantIds } from '../src/services/experimentComparison'

const row = (rowId: string, material: string, parts: number | '', extra: Partial<FormulaSnapshotRow> = {}): FormulaSnapshotRow => ({ rowId, material, parts, ...extra })
const experiment = (baseRows: FormulaSnapshotRow[], variants: Array<{ id: string; label: string; rows: FormulaSnapshotRow[] }>): Experiment => ({ experimentId: 'e1', parentFormulaId: 'f1', name: 'Study', createdAt: '', updatedAt: '', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' }, baseSnapshot: { name: 'Study', date: '', notes: '', formulaId: 'ACC-1', rows: baseRows }, nextVariantOrdinal: variants.length, variants: variants.map((v) => ({ variantId: v.id, parentVariantId: null, label: v.label, createdAt: '', updatedAt: '', note: '', snapshot: { rows: v.rows } })) })

describe('Experiment comparison', () => {
  it('preserves supplied state order and BASE row order', () => {
    const e = experiment([row('h', 'Hedione', 100), row('l', 'Linalool', 50), row('i', 'Indole', 10)], [{ id: 'c', label: 'C', rows: [] }, { id: 'a', label: 'A', rows: [] }, { id: 'b', label: 'B', rows: [] }])
    expect(experimentComparisonStates(e, ['c', 'a', 'b']).map((s) => s.label)).toEqual(['BASE', 'C', 'A', 'B'])
    expect(buildExperimentComparisonMatrix(experimentComparisonStates(e)).rows.map((r) => r.material)).toEqual(['Hedione', 'Linalool', 'Indole'])
  })
  it('appends new rows by first appearance and preserves removed rows', () => {
    const e = experiment([row('h', 'Hedione', 100), row('i', 'Indole', 10)], [{ id: 'a', label: 'A', rows: [row('h', 'Hedione', 90), row('v', 'Vanillin', 5)] }, { id: 'b', label: 'B', rows: [row('h', 'Hedione', 80), row('e', 'Ethyl Maltol', 3)] }])
    const m = buildExperimentComparisonMatrix(experimentComparisonStates(e)); expect(m.rows.map((r) => r.material)).toEqual(['Hedione', 'Indole', 'Vanillin', 'Ethyl Maltol']); expect(m.rows[1].cells[1]).toBeUndefined(); expect(m.rows[1].cells[0]?.parts).toBe(10)
  })
  it('uses exact rowId and preserves renamed/dilution metadata per cell', () => {
    const e = experiment([row('r1', 'Linalool', 100, { dilution: { enabled: true, percent: 1, solvent: 'ALC' } })], [{ id: 'a', label: 'A', rows: [row('r1', 'Linalyl Acetate', 100, { dilution: { enabled: true, percent: 10, solvent: 'DPG' } })] }]); const m = buildExperimentComparisonMatrix(experimentComparisonStates(e)); expect(m.rows).toHaveLength(1); expect(m.rows[0].cells[1]?.material).toBe('Linalyl Acetate'); expect(m.rows[0].cells[1]?.dilution?.solvent).toBe('DPG')
  })
  it('does not merge conflicting CAS values', () => {
    const e = experiment([row('', 'Material X', 1, { cas: '111-11-1' })], [{ id: 'a', label: 'A', rows: [row('', 'Material X', 2, { cas: '222-22-2' })] }]); expect(buildExperimentComparisonMatrix(experimentComparisonStates(e)).rows).toHaveLength(2)
  })
  it('matches unique CAS/material and unique material/dilution fallbacks', () => {
    const e = experiment([row('', 'Vanillin', 1, { cas: '121-33-5' }), row('', 'Indole', 2, { dilution: { enabled: true, percent: 1, solvent: 'ALC' } })], [{ id: 'a', label: 'A', rows: [row('', 'Vanillin', 3, { cas: ' 121-33-5 ' }), row('', 'Indole', 4, { dilution: { enabled: true, percent: 1, solvent: 'alc' } })] }]); expect(buildExperimentComparisonMatrix(experimentComparisonStates(e)).rows).toHaveLength(2)
  })
  it('does not guess when fallback candidates are ambiguous', () => {
    const e = experiment([row('', 'Musk', 1)], [{ id: 'a', label: 'A', rows: [row('', 'Musk', 2), row('', 'Musk', 3)] }]); const m = buildExperimentComparisonMatrix(experimentComparisonStates(e)); expect(m.rows).toHaveLength(3)
  })
  it('preserves zero, empty, missing, and independent totals', () => {
    const e = experiment([row('z', 'Zero', 0), row('empty', 'Empty', ''), row('gone', 'Gone', 10)], [{ id: 'a', label: 'A', rows: [row('z', 'Zero', 0), row('empty', 'Empty', '')] }]); const m = buildExperimentComparisonMatrix(experimentComparisonStates(e)); expect(m.rows[0].cells[0]?.parts).toBe(0); expect(m.rows[1].cells[0]?.parts).toBe(''); expect(m.rows[2].cells[1]).toBeUndefined(); expect(m.totals).toEqual([10, 0])
  })
  it('defaults to and orders at most four variants without mutation', () => {
    const e = experiment([], ['A', 'B', 'C', 'D', 'E'].map((label) => ({ id: label.toLowerCase(), label, rows: [] }))); const before = structuredClone(e); expect(getDefaultComparisonVariantIds(e)).toEqual(['a', 'b', 'c', 'd']); expect(getOrderedComparisonVariantIds(e, ['e', 'b', 'd'])).toEqual(['b', 'd', 'e']); expect(e).toEqual(before); expect(experimentComparisonStates(e, ['e', 'b', 'd']).map((s) => s.label)).toEqual(['BASE', 'B', 'D', 'E'])
  })
})
