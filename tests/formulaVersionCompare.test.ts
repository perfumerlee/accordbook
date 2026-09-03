import { describe, expect, it } from 'vitest'
import type { FormulaVersionSnapshot } from '../src/models/formula'
import { compareFormulaSnapshots } from '../src/services/formulaVersionCompare'

const snapshot = (rows: FormulaVersionSnapshot['rows']): FormulaVersionSnapshot => ({ name: 'Test', date: '2026-09-03', notes: '', formulaId: 'ACC-1', rows })
const row = (rowId: string, material: string, parts: number, extra: Partial<FormulaVersionSnapshot['rows'][number]> = {}) => ({ rowId, material, parts, ...extra })

describe('Formula Version comparison', () => {
  it('compares identical rows and ignores order', () => { const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10), row('b', 'B', 20)]), snapshot([row('b', 'B', 20), row('a', 'A', 10)])); expect(result.summary).toEqual({ changed: 0, added: 0, removed: 0, unchanged: 2 }) })
  it('reports direction-aware parts changes', () => { expect(compareFormulaSnapshots(snapshot([row('a', 'A', 10)]), snapshot([row('a', 'A', 30)])).rows[0].partsDelta).toBe(20); expect(compareFormulaSnapshots(snapshot([row('a', 'A', 30)]), snapshot([row('a', 'A', 10)])).rows[0].partsDelta).toBe(-20) })
  it('reports added and removed rows', () => { const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10)]), snapshot([row('b', 'B', 20)])); expect(result.summary.added).toBe(1); expect(result.summary.removed).toBe(1) })
  it('captures material, CAS, and dilution changes by rowId', () => { const from = row('a', 'A', 10, { cas: '1', dilution: { enabled: true, percent: 10, solvent: 'ALC' } }); const to = row('a', 'Renamed', 10, { cas: '2', dilution: { enabled: true, percent: 20, solvent: 'DPG' } }); expect(compareFormulaSnapshots(snapshot([from]), snapshot([to])).rows[0].changes).toEqual({ parts: false, material: true, cas: true, dilution: true }) })
  it('keeps duplicate materials distinct by rowId', () => { const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10), row('b', 'A', 20)]), snapshot([row('a', 'A', 11), row('b', 'A', 22)])); expect(result.rows.map((item) => item.rowId)).toEqual(['a', 'b']); expect(result.summary.changed).toBe(2) })
  it('supports legacy fallback matching without merging ambiguous rows', () => { const result = compareFormulaSnapshots(snapshot([{ rowId: '', material: 'A', parts: 10 }]), snapshot([{ rowId: 'new', material: ' A ', parts: 12 }])); expect(result.rows[0].matchType).toBe('fallback'); expect(result.rows[0].partsDelta).toBe(2) })
  it('ignores fully empty editor placeholders in both snapshots', () => { const blank = row('blank', '', 0); const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10), blank]), snapshot([row('a', 'A', 10), row('other', '', '')])); expect(result.summary).toEqual({ changed: 0, added: 0, removed: 0, unchanged: 1 }) })
  it('keeps unnamed rows with meaningful parts or CAS', () => { const result = compareFormulaSnapshots(snapshot([]), snapshot([row('parts', '', 50), row('cas', '', '', { cas: '115-95-7' })])); expect(result.summary.added).toBe(2); expect(result.rows.map((item) => item.toRow?.rowId)).toEqual(['parts', 'cas']) })
  it('treats named zero-parts rows as meaningful', () => { const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10)]), snapshot([row('a', 'A', 0)])); expect(result.summary.changed).toBe(1); expect(result.rows[0].partsDelta).toBe(-10) })
  it('does not match ambiguous legacy candidates', () => { const result = compareFormulaSnapshots(snapshot([row('', 'A', 10)]), snapshot([row('x', 'A', 11), row('y', 'A', 12)])); expect(result.summary).toEqual({ changed: 0, added: 2, removed: 1, unchanged: 0 }) })
  it('ignores placeholder reorder and placeholder count changes', () => { const result = compareFormulaSnapshots(snapshot([row('a', 'A', 10), row('blank-1', '', ''), row('blank-2', '', 0)]), snapshot([row('blank-2', '', 0), row('a', 'A', 10), row('blank-1', '', '')])); expect(result.summary).toEqual({ changed: 0, added: 0, removed: 0, unchanged: 1 }) })
})
