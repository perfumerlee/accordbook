import type { Formula, FormulaDilution, FormulaSnapshotRow, FormulaVersionSnapshot } from '../models/formula'
import { createVersionSnapshot } from './formulaVersionLifecycle'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

export type ComparisonStatus = 'unchanged' | 'changed' | 'added' | 'removed'
export type MatchType = 'rowId' | 'fallback' | 'unmatched'
export interface RowComparison { rowId: string; status: ComparisonStatus; matchType: MatchType; fromRow?: FormulaSnapshotRow; toRow?: FormulaSnapshotRow; partsDelta?: number; changes: { parts?: boolean; material?: boolean; cas?: boolean; dilution?: boolean } }
export interface FormulaComparison { from: FormulaVersionSnapshot; to: FormulaVersionSnapshot; rows: RowComparison[]; summary: { changed: number; added: number; removed: number; unchanged: number }; notesChanged: boolean; metadataChanged: boolean }

const normalized = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
export { isMeaningfulFormulaRow }
const comparableSnapshot = (snapshot: FormulaVersionSnapshot): FormulaVersionSnapshot => ({ ...snapshot, rows: snapshot.rows.filter(isMeaningfulFormulaRow) })
const dilutionEqual = (a?: FormulaDilution, b?: FormulaDilution) => JSON.stringify(a ?? undefined) === JSON.stringify(b ?? undefined)
const rowEqual = (a: FormulaSnapshotRow, b: FormulaSnapshotRow) => a.material === b.material && (a.cas ?? '') === (b.cas ?? '') && a.parts === b.parts && dilutionEqual(a.dilution, b.dilution)

export function compareFormulaSnapshots(from: FormulaVersionSnapshot, to: FormulaVersionSnapshot): FormulaComparison {
  const comparableFrom = comparableSnapshot(from); const comparableTo = comparableSnapshot(to); const unmatchedTo = new Set(comparableTo.rows.map((_, index) => index)); const rows: RowComparison[] = []
  comparableFrom.rows.forEach((fromRow) => {
    let index = fromRow.rowId.trim() ? comparableTo.rows.findIndex((candidate, i) => unmatchedTo.has(i) && candidate.rowId === fromRow.rowId) : -1; let matchType: MatchType = index >= 0 ? 'rowId' : 'unmatched'
    if (index < 0) { const candidates = comparableTo.rows.map((candidate, i) => ({ candidate, i })).filter(({ candidate, i }) => unmatchedTo.has(i) && normalized(candidate.material) === normalized(fromRow.material) && normalized(candidate.cas) === normalized(fromRow.cas)); if (candidates.length === 1) { index = candidates[0].i; matchType = 'fallback' } }
    if (index < 0) { rows.push({ rowId: fromRow.rowId, status: 'removed', matchType: 'unmatched', fromRow, partsDelta: -(Number(fromRow.parts) || 0), changes: {} }); return }
    unmatchedTo.delete(index); const toRow = comparableTo.rows[index]; const changes = { parts: fromRow.parts !== toRow.parts, material: fromRow.material !== toRow.material, cas: (fromRow.cas ?? '') !== (toRow.cas ?? ''), dilution: !dilutionEqual(fromRow.dilution, toRow.dilution) }; const changed = Object.values(changes).some(Boolean)
    rows.push({ rowId: fromRow.rowId, status: changed ? 'changed' : 'unchanged', matchType, fromRow, toRow, partsDelta: (Number(toRow.parts) || 0) - (Number(fromRow.parts) || 0), changes })
  })
  comparableTo.rows.forEach((toRow, index) => { if (unmatchedTo.has(index)) rows.push({ rowId: toRow.rowId, status: 'added', matchType: 'unmatched', toRow, partsDelta: Number(toRow.parts) || 0, changes: {} }) })
  const summary = { changed: rows.filter((row) => row.status === 'changed').length, added: rows.filter((row) => row.status === 'added').length, removed: rows.filter((row) => row.status === 'removed').length, unchanged: rows.filter((row) => row.status === 'unchanged').length }
  return { from, to, rows, summary, notesChanged: from.notes !== to.notes, metadataChanged: from.name !== to.name || from.date !== to.date || from.formulaId !== to.formulaId }
}

export function compareFormulaToCurrent(from: FormulaVersionSnapshot, current: Formula) { return compareFormulaSnapshots(from, createVersionSnapshot(current)) }
