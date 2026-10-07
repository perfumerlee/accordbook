import type { Experiment, ExperimentVariant } from '../models/experiment'
import type { FormulaDilution, FormulaSnapshotRow } from '../models/formula'
import type { ExperimentCompareSession } from './experimentWorkspaceState'
import { getOrderedComparisonVariantIds, EXPERIMENT_COMPARE_LIMIT } from './experimentComparison'
import { calculateTotalParts } from './formulaCalculator'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

export type ExperimentAiDeltaErrorCode =
  | 'INVALID_EXPERIMENT'
  | 'INVALID_SELECTION_STATE'
  | 'INVALID_SELECTION'
  | 'DUPLICATE_VARIANT_ID'
  | 'UNKNOWN_VARIANT'
  | 'DUPLICATE_SELECTION'
  | 'TOO_MANY_VARIANTS'
  | 'INVALID_SNAPSHOT'
  | 'INVALID_ROW'
  | 'DUPLICATE_ROW_ID'
  | 'MISSING_PARTS'
  | 'NEGATIVE_PARTS'
  | 'NON_FINITE_PARTS'
  | 'INVALID_TOTAL'

export class ExperimentAiDeltaError extends Error {
  constructor(readonly code: ExperimentAiDeltaErrorCode, readonly stateId?: string, readonly rowIndex?: number) {
    super(code)
    this.name = 'ExperimentAiDeltaError'
  }
}

export type ExperimentAiDeltaChangeKind = 'added' | 'removed' | 'unchanged' | 'adjusted' | 'replacement' | 'identity-uncertain'
export type ExperimentAiIdentityStatus = 'row-lineage' | 'heuristic-match' | 'unmatched' | 'ambiguous' | 'conflicting-cas' | 'replacement-on-lineage'
export type ExperimentAiDeltaField = 'material' | 'cas' | 'parts' | 'dilution'
export type ExperimentAiUncertaintyCode = 'HEURISTIC_NAME_MATCH_NOT_VERIFIED' | 'AMBIGUOUS_IDENTITY_CANDIDATES' | 'CONFLICTING_CAS_WITHOUT_LINEAGE' | 'ROW_LINEAGE_DOES_NOT_VERIFY_MATERIAL_IDENTITY' | 'CAS_CONFLICT'

export interface ExperimentAiDeltaRow {
  /** Local-only identifiers. A later provider serializer must project these out. */
  readonly rowId?: string
  readonly kind: ExperimentAiDeltaChangeKind
  readonly identityStatus: ExperimentAiIdentityStatus
  readonly before?: FormulaSnapshotRow
  readonly after?: FormulaSnapshotRow
  /** Signed after - before. Additions are positive; removals are negative. */
  readonly deltaParts: number
  readonly changedFields: readonly ExperimentAiDeltaField[]
  readonly uncertaintyCodes: readonly ExperimentAiUncertaintyCode[]
}

export interface ExperimentAiVariantDelta {
  /** Local-only Experiment identifier; never serialize this object directly to a provider. */
  readonly variantId: string
  readonly label: string
  readonly baseTotalParts: number
  readonly variantTotalParts: number
  readonly totalDeltaParts: number
  readonly baseComposition: 'complete' | 'incomplete'
  readonly variantComposition: 'complete' | 'incomplete'
  readonly changes: readonly ExperimentAiDeltaRow[]
}

export interface ExperimentAiDelta {
  readonly baseTotalParts: number
  readonly baseComposition: 'complete' | 'incomplete'
  /** False means this result must not be passed to an AI request until totals are complete. */
  readonly aiEligible: boolean
  readonly ineligibilityReasons: readonly { readonly code: 'BASE_TOTAL_INCOMPLETE' | 'VARIANT_TOTAL_INCOMPLETE'; readonly stateId: string; readonly totalParts: number }[]
  readonly variants: readonly ExperimentAiVariantDelta[]
}

type Row = { row: FormulaSnapshotRow; index: number }
const normalized = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const rowId = (row: FormulaSnapshotRow) => typeof row.rowId === 'string' ? row.rowId.trim() : ''
const cas = (row: FormulaSnapshotRow) => normalized(row.cas)
const dilutionKey = (value?: FormulaDilution) => value?.enabled ? `${value.percent}:${normalized(value.solvent)}` : 'none'

function invalid(code: ExperimentAiDeltaErrorCode, stateId: string, rowIndex?: number): never {
  throw new ExperimentAiDeltaError(code, stateId, rowIndex)
}

function validatedRows(value: unknown, stateId: string): FormulaSnapshotRow[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { rows?: unknown }).rows)) invalid('INVALID_SNAPSHOT', stateId)
  const rows = (value as { rows: unknown[] }).rows
  const seenIds = new Set<string>()
  const valid: FormulaSnapshotRow[] = []
  rows.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) invalid('INVALID_ROW', stateId, index)
    const row = candidate as Partial<FormulaSnapshotRow>
    if ((row.rowId !== undefined && typeof row.rowId !== 'string') || typeof row.material !== 'string' ||
        (row.cas !== undefined && typeof row.cas !== 'string') ||
        (row.memo !== undefined && typeof row.memo !== 'string') ||
        (row.marked !== undefined && typeof row.marked !== 'boolean')) invalid('INVALID_ROW', stateId, index)
    if (row.parts === undefined) invalid('MISSING_PARTS', stateId, index)
    if (row.parts !== '' && typeof row.parts !== 'number') invalid('INVALID_ROW', stateId, index)
    if (typeof row.parts === 'number' && !Number.isFinite(row.parts)) invalid('NON_FINITE_PARTS', stateId, index)
    if (typeof row.parts === 'number' && row.parts < 0) invalid('NEGATIVE_PARTS', stateId, index)
    const id = rowId(row as FormulaSnapshotRow)
    if (id && seenIds.has(id)) invalid('DUPLICATE_ROW_ID', stateId, index)
    if (id) seenIds.add(id)
    if (row.dilution !== undefined) {
      const d = row.dilution as FormulaDilution | null
      if (!d || typeof d !== 'object' || typeof d.enabled !== 'boolean' || typeof d.percent !== 'number' ||
          !Number.isFinite(d.percent) || d.percent < 0 || d.percent > 100 || typeof d.solvent !== 'string') invalid('INVALID_ROW', stateId, index)
    }
    const meaningful = isMeaningfulFormulaRow(row as FormulaSnapshotRow)
    if (!meaningful) {
      valid.push(row as FormulaSnapshotRow)
      return
    }
    if (!normalized(row.material)) invalid('INVALID_ROW', stateId, index)
    if (row.parts === '' || row.parts === undefined) invalid('MISSING_PARTS', stateId, index)
    valid.push(row as FormulaSnapshotRow)
  })
  return valid
}

function total(rows: FormulaSnapshotRow[], stateId: string): number {
  const value = calculateTotalParts(rows.map(row => ({ ...row, id: row.rowId || '' })))
  if (!Number.isFinite(value)) invalid('INVALID_TOTAL', stateId)
  return value
}

function namesCompatible(a: FormulaSnapshotRow, b: FormulaSnapshotRow): boolean {
  return !!normalized(a.material) && normalized(a.material) === normalized(b.material) && !(cas(a) && cas(b) && cas(a) !== cas(b))
}

function snapshotRow(row: FormulaSnapshotRow): FormulaSnapshotRow {
  return structuredClone(row)
}

function deltaRow(before: FormulaSnapshotRow | undefined, after: FormulaSnapshotRow | undefined, identityStatus: ExperimentAiIdentityStatus, forcedKind?: ExperimentAiDeltaChangeKind): ExperimentAiDeltaRow {
  const changedFields: ExperimentAiDeltaField[] = []
  const uncertaintyCodes: ExperimentAiUncertaintyCode[] = []
  const materialChanged = !!before && !!after && normalized(before.material) !== normalized(after.material)
  const casChanged = !!before && !!after && cas(before) !== cas(after)
  const dilutionChanged = !!before && !!after && dilutionKey(before.dilution) !== dilutionKey(after.dilution)
  const partsChanged = !!before && !!after && before.parts !== after.parts
  if (materialChanged) changedFields.push('material')
  if (casChanged) changedFields.push('cas')
  if (partsChanged) changedFields.push('parts')
  if (dilutionChanged) changedFields.push('dilution')
  if (identityStatus === 'heuristic-match') uncertaintyCodes.push('HEURISTIC_NAME_MATCH_NOT_VERIFIED')
  if (identityStatus === 'ambiguous') uncertaintyCodes.push('AMBIGUOUS_IDENTITY_CANDIDATES')
  if (identityStatus === 'conflicting-cas') uncertaintyCodes.push('CONFLICTING_CAS_WITHOUT_LINEAGE')
  if (identityStatus === 'replacement-on-lineage') uncertaintyCodes.push('ROW_LINEAGE_DOES_NOT_VERIFY_MATERIAL_IDENTITY')
  if (casChanged && before && after && cas(before) && cas(after) && cas(before) !== cas(after)) uncertaintyCodes.push('CAS_CONFLICT')

  const deltaParts = before && after
    ? (after.parts as number) - (before.parts as number)
    : after ? after.parts as number : -(before!.parts as number)
  const kind = forcedKind ?? (!before ? 'added' : !after ? 'removed' :
    identityStatus === 'replacement-on-lineage' ? 'replacement' :
    identityStatus === 'conflicting-cas' ? 'identity-uncertain' :
    changedFields.length ? 'adjusted' : 'unchanged')
  return {
    ...(before && rowId(before) ? { rowId: rowId(before) } : after && rowId(after) ? { rowId: rowId(after) } : {}),
    kind, identityStatus,
    ...(before ? { before: snapshotRow(before) } : {}), ...(after ? { after: snapshotRow(after) } : {}),
    deltaParts, changedFields, uncertaintyCodes,
  }
}

function compareVariant(baseRows: FormulaSnapshotRow[], variantRows: FormulaSnapshotRow[]): ExperimentAiDeltaRow[] {
  const base = baseRows.filter(isMeaningfulFormulaRow).map((row, index) => ({ row, index }))
  const variant = variantRows.filter(isMeaningfulFormulaRow).map((row, index) => ({ row, index }))
  const unmatchedBase = new Set(base.map((_, index) => index))
  const unmatchedVariant = new Set(variant.map((_, index) => index))
  const changes: ExperimentAiDeltaRow[] = []

  // Row IDs describe edit lineage. Pair them even when material or dilution changed,
  // then report the identity change instead of disguising it as a parts adjustment.
  for (const bi of [...unmatchedBase]) {
    const id = rowId(base[bi].row)
    if (!id) continue
    const vi = variant.findIndex((entry, index) => unmatchedVariant.has(index) && rowId(entry.row) === id)
    if (vi < 0) continue
    const before = base[bi].row, after = variant[vi].row
    unmatchedBase.delete(bi); unmatchedVariant.delete(vi)
    const materialChanged = normalized(before.material) !== normalized(after.material)
    const casConflict = !!cas(before) && !!cas(after) && cas(before) !== cas(after)
    changes.push(deltaRow(before, after, materialChanged ? 'replacement-on-lineage' : casConflict ? 'conflicting-cas' : 'row-lineage'))
  }

  // Fall back to a unique normalized material-name match with no CAS conflict.
  // Dilution is deliberately compared as a field, not used to hide dilution-only edits.
  const candidateVariant = (bi: number) => [...unmatchedVariant].filter(vi => namesCompatible(base[bi].row, variant[vi].row))
  const candidateBase = (vi: number) => [...unmatchedBase].filter(bi => namesCompatible(base[bi].row, variant[vi].row))
  for (const bi of [...unmatchedBase]) {
    const vc = candidateVariant(bi)
    if (vc.length !== 1) continue
    const vi = vc[0]
    if (candidateBase(vi).length !== 1) continue
    unmatchedBase.delete(bi); unmatchedVariant.delete(vi)
    changes.push(deltaRow(base[bi].row, variant[vi].row, 'heuristic-match'))
  }

  for (const bi of unmatchedBase) {
    const row = base[bi].row
    const sameName = [...unmatchedVariant].filter(vi => normalized(variant[vi].row.material) === normalized(row.material))
    const hasCompatibleCandidate = sameName.some(vi => namesCompatible(row, variant[vi].row))
    changes.push(deltaRow(row, undefined, hasCompatibleCandidate ? 'ambiguous' : sameName.length ? 'conflicting-cas' : 'unmatched'))
  }
  for (const vi of unmatchedVariant) {
    const row = variant[vi].row
    const sameName = [...unmatchedBase].filter(bi => normalized(base[bi].row.material) === normalized(row.material))
    const hasCompatibleCandidate = sameName.some(bi => namesCompatible(base[bi].row, row))
    changes.push(deltaRow(undefined, row, hasCompatibleCandidate ? 'ambiguous' : sameName.length ? 'conflicting-cas' : 'unmatched'))
  }
  // Report order is stable: BASE order first, then unmatched Variant order.
  return changes
}

/** Compare immutable BASE and Evaluation snapshots without consulting a live Variant. */
export function buildExperimentAiDeltaForSnapshots(baseSnapshot: { rows: FormulaSnapshotRow[] }, evaluatedSnapshot: { rows: FormulaSnapshotRow[] }): {
  baseTotalParts: number
  evaluatedTotalParts: number
  totalDeltaParts: number
  changes: ExperimentAiDeltaRow[]
} {
  const baseRows = validatedRows(baseSnapshot, 'base')
  const evaluatedRows = validatedRows(evaluatedSnapshot, 'evaluation')
  const baseTotalParts = total(baseRows, 'base')
  const evaluatedTotalParts = total(evaluatedRows, 'evaluation')
  return { baseTotalParts, evaluatedTotalParts, totalDeltaParts: evaluatedTotalParts - baseTotalParts, changes: compareVariant(baseRows, evaluatedRows) }
}

/** Pure AI-bound calculation input. Pass the committed navigation session, never draft compare selections. */
export function buildExperimentAiDelta(experiment: Experiment, session: ExperimentCompareSession): ExperimentAiDelta {
  if (!experiment || typeof experiment !== 'object' || !Array.isArray(experiment.variants) || !experiment.baseSnapshot) throw new ExperimentAiDeltaError('INVALID_EXPERIMENT')
  if (!session || session.mode !== 'navigation' || session.draftIds !== null || !Array.isArray(session.committedIds)) throw new ExperimentAiDeltaError('INVALID_SELECTION_STATE')
  const ids = [...session.committedIds]
  if (!ids.length) throw new ExperimentAiDeltaError('INVALID_SELECTION')
  if (ids.length > EXPERIMENT_COMPARE_LIMIT) throw new ExperimentAiDeltaError('TOO_MANY_VARIANTS')
  if (ids.some(id => typeof id !== 'string' || !id.trim())) throw new ExperimentAiDeltaError('INVALID_SELECTION')
  if (new Set(ids).size !== ids.length) throw new ExperimentAiDeltaError('DUPLICATE_SELECTION')
  const variantIds = new Set<string>()
  for (const variant of experiment.variants) {
    if (!variant || typeof variant.variantId !== 'string' || !variant.variantId.trim()) throw new ExperimentAiDeltaError('INVALID_EXPERIMENT')
    if (variantIds.has(variant.variantId)) throw new ExperimentAiDeltaError('DUPLICATE_VARIANT_ID')
    variantIds.add(variant.variantId)
  }
  for (const id of ids) if (!variantIds.has(id)) throw new ExperimentAiDeltaError('UNKNOWN_VARIANT', id)

  // This is precisely the order rendered by the current Comparison Sheet. Validate before
  // invoking its compatibility helper because that helper intentionally filters old UI IDs.
  const orderedIds = getOrderedComparisonVariantIds(experiment, ids)
  if (orderedIds.length !== ids.length) throw new ExperimentAiDeltaError('UNKNOWN_VARIANT')
  const baseRows = validatedRows(experiment.baseSnapshot, 'base')
  const baseTotalParts = total(baseRows, 'base')
  const variantDeltas: ExperimentAiVariantDelta[] = []
  const reasons: { code: 'BASE_TOTAL_INCOMPLETE' | 'VARIANT_TOTAL_INCOMPLETE'; stateId: string; totalParts: number }[] = []
  const baseComposition = baseTotalParts === 1000 ? 'complete' : 'incomplete'
  if (baseComposition === 'incomplete') reasons.push({ code: 'BASE_TOTAL_INCOMPLETE', stateId: 'base', totalParts: baseTotalParts })

  for (const id of orderedIds) {
    const variant = experiment.variants.find(item => item.variantId === id) as ExperimentVariant
    const rows = validatedRows(variant.snapshot, id)
    const variantTotalParts = total(rows, id)
    const variantComposition = variantTotalParts === 1000 ? 'complete' : 'incomplete'
    if (variantComposition === 'incomplete') reasons.push({ code: 'VARIANT_TOTAL_INCOMPLETE', stateId: id, totalParts: variantTotalParts })
    variantDeltas.push({ variantId: id, label: variant.label, baseTotalParts, variantTotalParts,
      totalDeltaParts: variantTotalParts - baseTotalParts, baseComposition, variantComposition,
      changes: compareVariant(baseRows, rows) })
  }
  return { baseTotalParts, baseComposition, aiEligible: reasons.length === 0, ineligibilityReasons: reasons, variants: variantDeltas }
}
