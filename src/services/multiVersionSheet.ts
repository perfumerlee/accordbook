import type { Formula, FormulaDilution, FormulaSnapshotRow, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import { createVersionSnapshot } from './formulaVersionLifecycle'
import { calculateFormulaTotals } from './formulaCalculator'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

export type MultiVersionState = { id: string; label: string; createdAt?: string; snapshot: FormulaVersionSnapshot; isCurrent: boolean }
export type MultiVersionMatrixRow = { identity: string; material: string; cas?: string; dilution?: FormulaDilution; cells: Array<FormulaSnapshotRow | undefined> }
export type MultiVersionMatrix = { states: MultiVersionState[]; rows: MultiVersionMatrixRow[]; totals: number[] }

const norm = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const dilutionKey = (d?: FormulaDilution) => d?.enabled ? `${d.percent}:${norm(d.solvent)}` : 'none'
const sameFallback = (a: FormulaSnapshotRow, b: FormulaSnapshotRow) => norm(a.cas) !== '' && norm(a.cas) === norm(b.cas) && norm(a.material) === norm(b.material)
const sameMaterialDilution = (a: FormulaSnapshotRow, b: FormulaSnapshotRow) => norm(a.material) !== '' && norm(a.material) === norm(b.material) && dilutionKey(a.dilution) === dilutionKey(b.dilution)

function findMatch(row: FormulaSnapshotRow, rows: FormulaSnapshotRow[], used: Set<string>): FormulaSnapshotRow | undefined {
  if (row.rowId.trim()) { const exact = rows.find(candidate => !used.has(candidate.rowId) && candidate.rowId === row.rowId); if (exact) return exact }
  for (const predicate of [sameFallback, sameMaterialDilution]) {
    const candidates = rows.filter(candidate => predicate(row, candidate))
    if (candidates.length === 1 && !used.has(candidates[0].rowId)) return candidates[0]
  }
  return undefined
}

export function currentComparisonState(formula: Formula): MultiVersionState { return { id: 'current', label: 'CURRENT', snapshot: createVersionSnapshot(formula), isCurrent: true } }
export function versionComparisonState(version: FormulaVersion): MultiVersionState { return { id: version.versionId, label: version.kind === 'manual' && version.versionNumber !== null ? `V${String(version.versionNumber).padStart(2, '0')}` : 'RESTORE POINT', createdAt: version.createdAt, snapshot: version.snapshot, isCurrent: false } }

export function buildMultiVersionMatrix(input: MultiVersionState[]): MultiVersionMatrix {
  const states = [...input].sort((a, b) => a.isCurrent ? 1 : b.isCurrent ? -1 : (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.label.localeCompare(b.label))
  const rows: MultiVersionMatrixRow[] = []
  const representatives: FormulaSnapshotRow[] = []
  states.forEach((state, stateIndex) => {
    const used = new Set<string>()
    state.snapshot.rows.filter(isMeaningfulFormulaRow).forEach(row => {
      const match = findMatch(row, representatives, used)
      let matrix = match ? rows[representatives.indexOf(match)] : undefined
      if (!matrix) { matrix = { identity: row.rowId || `${norm(row.material)}|${norm(row.cas)}|${dilutionKey(row.dilution)}|${rows.length}`, material: row.material, cas: row.cas, dilution: row.dilution, cells: Array(states.length).fill(undefined) }; rows.push(matrix); representatives.push(row) }
      matrix.cells[stateIndex] = row; used.add(representatives[rows.indexOf(matrix)].rowId)
    })
  })
  return { states, rows, totals: states.map(state => calculateFormulaTotals(state.snapshot.rows.map(row => ({ ...row, id: row.rowId }))).totalParts) }
}
