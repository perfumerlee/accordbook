import type { Formula } from '../models/formula'
import type { WorkspaceFile } from '../models/workspaceFile'
import type { WorkspaceSource } from './workspaceExport'
import { validateWorkspaceFile, validateWorkspaceGraph, WORKSPACE_LIMITS, WorkspaceValidationError } from './workspaceValidation'

export interface WorkspaceIdMaps {
  formulas: Map<string, string>
  versions: Map<string, string>
  experiments: Map<string, string>
  variants: Map<string, Map<string, string>>
  evaluations: Map<string, Map<string, Map<string, string>>>
}
/** Build every scoped map before rewriting. Historical revision/record/row IDs are not keys to regenerate. */
export function remapWorkspace(input: WorkspaceFile, displayFormulaId: string, importedAt: string): { records: WorkspaceSource; maps: WorkspaceIdMaps } {
  return remapValidatedWorkspace(validateWorkspaceFile(input), displayFormulaId, importedAt)
}
/** Consumes an exclusively owned validated DTO; immutable snapshots may be shared within this operation. */
export function remapValidatedWorkspace(file: WorkspaceFile, displayFormulaId: string, importedAt: string): { records: WorkspaceSource; maps: WorkspaceIdMaps } {
  if (!displayFormulaId.trim() || displayFormulaId.length > WORKSPACE_LIMITS.maxStringLength) throw new WorkspaceValidationError('$.formula.formulaId', 'invalid identity')
  const maps: WorkspaceIdMaps = { formulas: new Map(), versions: new Map(), experiments: new Map(), variants: new Map(), evaluations: new Map() }
  maps.formulas.set(file.formula.id, crypto.randomUUID())
  for (const v of file.versions) maps.versions.set(v.versionId, crypto.randomUUID())
  for (const e of file.experiments) {
    maps.experiments.set(e.experimentId, crypto.randomUUID())
    const variants = new Map<string, string>(); const evaluations = new Map<string, Map<string, string>>()
    maps.variants.set(e.experimentId, variants); maps.evaluations.set(e.experimentId, evaluations)
    for (const v of e.variants) {
      variants.set(v.variantId, crypto.randomUUID())
      evaluations.set(v.variantId, new Map((v.evaluations ?? []).map(ev => [ev.evaluationId, crypto.randomUUID()])))
    }
  }
  const formulaId = maps.formulas.get(file.formula.id)!
  // Recover only unambiguous exact-content lineage for edge Current rows lacking rowId.
  // Never guess from labels, array positions, or ambiguous same-material rows.
  const rowKey = (row: WorkspaceFile['formula']['rows'][number]) => JSON.stringify([row.material, row.cas ?? '', row.parts, row.dilution ?? null])
  const historical = new Map<string, Set<string>>()
  const remember = (rows: { rowId: string; material: string; parts: number | ''; cas?: string; dilution?: WorkspaceFile['formula']['rows'][number]['dilution'] }[]) => {
    for (const row of rows) { const key = rowKey(row); const ids = historical.get(key) ?? new Set<string>(); ids.add(row.rowId); historical.set(key, ids) }
  }
  if (file.formula.rows.some(row => !row.rowId)) {
   for (const v of file.versions) remember(v.snapshot.rows)
   for (const e of file.experiments) {
    remember(e.baseSnapshot.rows)
    for (const v of e.variants) { remember(v.snapshot.rows); for (const ev of v.evaluations ?? []) remember(ev.snapshot.rows) }
  }
  }
  const usedRows = new Set(file.formula.rows.flatMap(row => row.rowId ? [row.rowId] : []))
  const occurrences = new Map<string, number>()
  for (const row of file.formula.rows) occurrences.set(rowKey(row), (occurrences.get(rowKey(row)) ?? 0) + 1)
  const logicalRowId = (row: WorkspaceFile['formula']['rows'][number]) => {
    if (row.rowId) return row.rowId
    const candidates = historical.get(rowKey(row))
    const candidate = candidates?.size === 1 && occurrences.get(rowKey(row)) === 1 ? [...candidates][0] : undefined
    const id = candidate && !usedRows.has(candidate) ? candidate : crypto.randomUUID()
    usedRows.add(id)
    return id
  }
  const formula: Formula = {
    ...file.formula, id: formulaId, formulaId: displayFormulaId,
    workspaceImport: { sourceFormulaId: file.formula.formulaId, importedAt },
    rows: file.formula.rows.map(row => ({ ...row, id: crypto.randomUUID(), rowId: logicalRowId(row) })),
  }
  if (formula.releasedVersionId) formula.releasedVersionId = maps.versions.get(formula.releasedVersionId)!
  if (formula.provenance) formula.provenance = { ...formula.provenance, revisions: formula.provenance.revisions.map(r => r.restoredFromVersionId ? { ...r, restoredFromVersionId: maps.versions.get(r.restoredFromVersionId)! } : r) }
  const versions = file.versions.map(v => ({ ...v, versionId: maps.versions.get(v.versionId)!, parentFormulaId: formulaId }))
  const experiments = file.experiments.map(e => {
    const variants = maps.variants.get(e.experimentId)!; const evaluations = maps.evaluations.get(e.experimentId)!
    return { ...e, experimentId: maps.experiments.get(e.experimentId)!, parentFormulaId: formulaId,
      baseSource: e.baseSource.kind === 'version' ? { kind: 'version' as const, sourceVersionId: maps.versions.get(e.baseSource.sourceVersionId)! } : e.baseSource,
      variants: e.variants.map(v => ({ ...v, variantId: variants.get(v.variantId)!, parentVariantId: v.parentVariantId === null ? null : variants.get(v.parentVariantId)!,
        ...(v.evaluations ? { evaluations: v.evaluations.map(ev => ({ ...ev, evaluationId: evaluations.get(v.variantId)!.get(ev.evaluationId)! })) } : {}),
        ...(v.sourceEvaluationId ? { sourceEvaluationId: evaluations.get(v.parentVariantId!)!.get(v.sourceEvaluationId)! } : {}),
        ...(v.origin ? { origin: { ...v.origin, evaluationId: evaluations.get(v.parentVariantId!)!.get(v.origin.evaluationId)! } } : {}),
      })),
    }
  })
  const reviews = (file.reviews ?? []).map(review => {
    const experimentId = maps.experiments.get(review.experimentId)!
    const variants = maps.variants.get(review.experimentId)!
    if (review.operation === 'compare') return { ...structuredClone(review), experimentId,
      selectedVariantIds: review.selectedVariantIds.map(id => variants.get(id)!),
      variantIdsByLabel: Object.fromEntries(Object.entries(review.variantIdsByLabel).map(([label, id]) => [label, variants.get(id)!])),
    }
    return { ...structuredClone(review), experimentId, variantId: variants.get(review.variantId)!,
      evaluationId: maps.evaluations.get(review.experimentId)!.get(review.variantId)!.get(review.evaluationId)!,
    }
  })
  const records = { formula, versions, experiments, reviews }
  const logicalIds = formula.rows.map(row => row.rowId!)
  if (new Set(logicalIds).size !== logicalIds.length) throw new WorkspaceValidationError('$.formula.rows', 'duplicate identity')
  validateWorkspaceGraph({ ...file, ...records }) // Mapping can change references, not snapshot shapes.
  return { records, maps }
}
