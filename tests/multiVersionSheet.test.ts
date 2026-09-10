import { describe, expect, it } from 'vitest'
import type { FormulaVersionSnapshot } from '../src/models/formula'
import { buildMultiVersionMatrix, currentComparisonState, versionComparisonState } from '../src/services/multiVersionSheet'
import { formatDilutionSuffix } from '../src/services/dilutionDisplay'

const snap = (rows: FormulaVersionSnapshot['rows']): FormulaVersionSnapshot => ({ name: 'Test', date: '2026-09-10', notes: '', formulaId: 'ACC-1', rows })
const row = (rowId: string, material: string, parts: number | '', extra: Partial<FormulaVersionSnapshot['rows'][number]> = {}) => ({ rowId, material, parts, ...extra })
const state = (id: string, createdAt: string, rows: FormulaVersionSnapshot['rows']) => ({ id, label: id, createdAt, snapshot: snap(rows), isCurrent: false })

describe('Multi-Version Sheet matrix', () => {
  it('keeps first appearance order and renders missing rows as empty cells', () => {
    const result = buildMultiVersionMatrix([
      state('V1', '2026-01-01', [row('a', 'A', 500), row('b', 'B', 300), row('c', 'C', 200)]),
      state('V2', '2026-01-02', [row('a', 'A', 450), row('b', 'B', 300), row('c', 'C', 200), row('d', 'D', 50)]),
      state('V3', '2026-01-03', [row('a', 'A', 450), row('c', 'C', 200), row('d', 'D', 50), row('e', 'E', 300)]),
    ])
    expect(result.rows.map(item => item.material)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(result.rows.map(item => item.cells.map(cell => cell?.parts))).toEqual([[500, 450, 450], [300, 300, undefined], [200, 200, 200], [undefined, 50, 50], [undefined, undefined, 300]])
  })
  it('uses deterministic fallback and does not merge ambiguous names', () => {
    const result = buildMultiVersionMatrix([state('V1', '2026-01-01', [row('a', 'A', 1), row('b', 'A', 2)]), state('V2', '2026-01-02', [row('x', ' A ', 3)])])
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].cells.map(cell => cell?.parts)).toEqual([1, undefined])
  })
  it('keeps zero and empty parts distinct from a missing row', () => {
    const result = buildMultiVersionMatrix([state('V1', '2026-01-01', [row('a', 'A', 0), row('b', 'B', '')]), state('V2', '2026-01-02', [])])
    expect(result.rows[0].cells[0]?.parts).toBe(0); expect(result.rows[1].cells[0]?.parts).toBe(''); expect(result.rows[0].cells[1]).toBeUndefined()
  })
  it('places CURRENT last without mutating the Formula', () => {
    const formula = { id: 'f', formulaId: 'ACC-1', date: '2026-01-01', name: '', notes: '', rows: [{ id: 'r', rowId: 'r', material: 'A', parts: 10 }], createdAt: '2026-01-01', updatedAt: '2026-01-02' }
    const before = JSON.stringify(formula); const result = buildMultiVersionMatrix([currentComparisonState(formula), state('V1', '2026-01-01', [row('r', 'A', 5)])])
    expect(result.states.map(item => item.id)).toEqual(['V1', 'current']); expect(JSON.stringify(formula)).toBe(before)
  })
  it('formats dilution using the existing notation', () => { expect(formatDilutionSuffix({ enabled: true, percent: 10, solvent: 'DPG' })).toBe('@10% in DPG'); expect(formatDilutionSuffix({ enabled: true, percent: 10, solvent: '' })).toBe('@10% in ALC'); expect(formatDilutionSuffix({ enabled: false, percent: 10, solvent: 'IPM' })).toBe('') })
})
