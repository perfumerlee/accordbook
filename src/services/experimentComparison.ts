import type { FormulaDilution, FormulaSnapshotRow } from '../models/formula'
import type { Experiment, ExperimentVariant } from '../models/experiment'
import { calculateFormulaTotals } from './formulaCalculator'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

export type ExperimentComparisonState = { id: string; label: string; rows: FormulaSnapshotRow[] }
export type ExperimentComparisonRow = { identity: string; material: string; dilution?: FormulaDilution; cells: Array<FormulaSnapshotRow | undefined> }
export type ExperimentComparisonMatrix = { states: ExperimentComparisonState[]; rows: ExperimentComparisonRow[]; totals: number[] }
const norm = (v?: string) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const dil = (v?: FormulaDilution) => v?.enabled ? `${v.percent}:${norm(v.solvent)}` : 'none'
const fallback = (a: FormulaSnapshotRow, b: FormulaSnapshotRow) => norm(a.cas) && norm(a.cas) === norm(b.cas) && norm(a.material) === norm(b.material)
const sameMaterial = (a: FormulaSnapshotRow, b: FormulaSnapshotRow) => norm(a.material) && norm(a.material) === norm(b.material) && dil(a.dilution) === dil(b.dilution) && (!norm(a.cas) || !norm(b.cas) || norm(a.cas) === norm(b.cas))
function match(row: FormulaSnapshotRow, representatives: FormulaSnapshotRow[], used: Set<number>, stateRows: FormulaSnapshotRow[]) {
  const exact = row.rowId.trim() ? representatives.findIndex((candidate, i) => !used.has(i) && candidate.rowId === row.rowId) : -1
  if (exact >= 0) return exact
  for (const predicate of [fallback, sameMaterial]) { if (stateRows.filter((candidate) => candidate !== row && predicate(row, candidate)).length > 0) continue; const candidates = representatives.map((candidate, i) => ({ candidate, i })).filter(({ candidate, i }) => !used.has(i) && predicate(row, candidate)); if (candidates.length === 1) return candidates[0].i }
  return -1
}
export function getDefaultComparisonVariantIds(experiment: Experiment): string[] { return experiment.variants.slice(0, 4).map((v) => v.variantId) }
export function getOrderedComparisonVariantIds(experiment: Experiment, variantIds: string[]): string[] { const selected = new Set(variantIds); return experiment.variants.filter((v) => selected.has(v.variantId)).slice(0, 4).map((v) => v.variantId) }
export function experimentComparisonStates(experiment: Experiment, variantIds = getDefaultComparisonVariantIds(experiment)): ExperimentComparisonState[] { const orderedIds = getOrderedComparisonVariantIds(experiment, variantIds); const variants = orderedIds.map((id) => experiment.variants.find((v) => v.variantId === id)).filter((v): v is ExperimentVariant => Boolean(v)); return [{ id: 'base', label: 'BASE', rows: experiment.baseSnapshot.rows }, ...variants.map((v) => ({ id: v.variantId, label: v.label, rows: v.snapshot.rows }))] }
export function buildExperimentComparisonMatrix(states: ExperimentComparisonState[]): ExperimentComparisonMatrix { const rows: ExperimentComparisonRow[] = []; const reps: FormulaSnapshotRow[] = []; states.forEach((state, si) => { const meaningfulRows = state.rows.filter(isMeaningfulFormulaRow); const used = new Set<number>(); meaningfulRows.forEach((row) => { const index = match(row, reps, used, meaningfulRows); const target = index >= 0 ? rows[index] : (() => { reps.push(row); const created = { identity: row.rowId || `${norm(row.material)}|${dil(row.dilution)}|${rows.length}`, material: row.material, dilution: row.dilution, cells: Array<FormulaSnapshotRow | undefined>(states.length).fill(undefined) }; rows.push(created); return created })(); const targetIndex = rows.indexOf(target); target.cells[si] = row; used.add(targetIndex) }) }); return { states, rows, totals: states.map((state) => calculateFormulaTotals(state.rows.map((row) => ({ ...row, id: row.rowId }))).totalParts) } }
