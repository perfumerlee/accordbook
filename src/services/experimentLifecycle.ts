import type { Formula, FormulaSnapshotRow, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import type { Experiment, ExperimentContent, ExperimentVariant } from '../models/experiment'
import { canCreateBranchFrom } from './experimentGenealogy'

const clone = <T>(value: T): T => structuredClone(value)
const newId = () => crypto.randomUUID()
const timestamp = () => new Date().toISOString()

function requireFormula(formula: Formula): void {
  if (!formula.id.trim()) throw new Error('Formula id is required.')
}

function normalizeRows(rows: readonly FormulaSnapshotRow[]): FormulaSnapshotRow[] {
  const used = new Set<string>()
  return rows.map((row) => {
    const sourceId = row.rowId?.trim() ?? ''
    const rowId = sourceId && !used.has(sourceId) ? sourceId : newId()
    used.add(rowId)
    return { ...clone(row), rowId }
  })
}

function baseSnapshot(formula: Formula): Experiment['baseSnapshot'] {
  const rows = normalizeRows(formula.rows.map(({ id: _id, rowId, material, cas, parts, dilution, marked }) => ({ rowId: rowId ?? '', material, cas, parts, dilution, marked })))
  // Experiment notes are independent working notes; never copy Formula notes into a new trial.
  return clone({ name: formula.name, date: formula.date, notes: '', formulaId: formula.formulaId, rows })
}

function contentFromRows(rows: readonly FormulaSnapshotRow[]): ExperimentContent {
  return { rows: rows.map((row) => clone(row)) }
}

function makeExperiment(formula: Formula, source: Experiment['baseSource'], snapshot: Experiment['baseSnapshot']): Experiment {
  const now = timestamp()
  return { experimentId: newId(), parentFormulaId: formula.id, name: snapshot.name, createdAt: now, updatedAt: now, baseSource: clone(source), baseSnapshot: clone(snapshot), nextVariantOrdinal: 0, variants: [] }
}

export function createExperimentFromCurrent(formula: Formula): Experiment {
  requireFormula(formula)
  const snapshot = baseSnapshot(formula)
  return makeExperiment(formula, { kind: 'current', sourceCurrentUpdatedAt: formula.updatedAt }, snapshot)
}

export function createExperimentFromVersion(formula: Formula, version: FormulaVersion): Experiment {
  requireFormula(formula)
  if (version.parentFormulaId !== formula.id) throw new Error('Version does not belong to this Formula.')
  const snapshot: FormulaVersionSnapshot = { ...clone(version.snapshot), notes: '', rows: normalizeRows(version.snapshot.rows) }
  return makeExperiment(formula, { kind: 'version', sourceVersionId: version.versionId }, snapshot)
}

export function ordinalToVariantLabel(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error('Variant ordinal must be a non-negative integer.')
  let value = ordinal + 1
  let label = ''
  while (value > 0) { const remainder = (value - 1) % 26; label = String.fromCharCode(65 + remainder) + label; value = Math.floor((value - 1) / 26) }
  return label
}

function createVariant(experiment: Experiment, parentVariantId: string | null, rows: readonly FormulaSnapshotRow[]): Experiment {
  const parent = parentVariantId ? experiment.variants.find((variant) => variant.variantId === parentVariantId) : undefined
  if (parentVariantId && !parent) throw new Error('Parent Variant does not exist.')
  const now = timestamp()
  const topLevelLabel = ordinalToVariantLabel(experiment.nextVariantOrdinal)
  const childOrdinal = parentVariantId ? (parent!.nextChildOrdinal ?? inferNextChildOrdinal(experiment, parent!)) : undefined
  const label = parentVariantId ? `${parent!.label}${childOrdinal}` : topLevelLabel
  const variant: ExperimentVariant = { variantId: newId(), parentVariantId, label, createdAt: now, updatedAt: now, ...(parentVariantId ? { nextChildOrdinal: 1 } : {}), snapshot: contentFromRows(rows), note: '' }
  const variants = experiment.variants.map((item) => item.variantId === parentVariantId ? { ...clone(item), nextChildOrdinal: (childOrdinal ?? 1) + 1 } : clone(item))
  return { ...clone(experiment), variants: [...variants, variant], nextVariantOrdinal: parentVariantId ? experiment.nextVariantOrdinal : experiment.nextVariantOrdinal + 1, updatedAt: now }
}

function inferNextChildOrdinal(experiment: Experiment, parent: ExperimentVariant): number {
  const prefix = parent.label
  const max = experiment.variants.filter((item) => item.parentVariantId === parent.variantId).reduce((value, item) => {
    const match = item.label.startsWith(prefix) ? Number(item.label.slice(prefix.length)) : 0
    return Number.isInteger(match) && match > value ? match : value
  }, 0)
  return max + 1
}

export function addVariantFromBase(experiment: Experiment): Experiment {
  return createVariant(experiment, null, experiment.baseSnapshot.rows)
}

export function addVariantFromVariant(experiment: Experiment, parentVariantId: string): Experiment {
  const parent = experiment.variants.find((variant) => variant.variantId === parentVariantId)
  if (!parent) throw new Error('Parent Variant does not exist.')
  if (!canCreateBranchFrom(experiment, parentVariantId)) throw new Error('Branch depth is limited to one level in v1.08.')
  return createVariant(experiment, parentVariantId, parent.snapshot.rows)
}

function updateVariant(experiment: Experiment, variantId: string, update: (variant: ExperimentVariant) => ExperimentVariant): Experiment {
  if (!experiment.variants.some((variant) => variant.variantId === variantId)) throw new Error('Variant does not exist.')
  return { ...clone(experiment), variants: experiment.variants.map((variant) => variant.variantId === variantId ? update(clone(variant)) : clone(variant)), updatedAt: timestamp() }
}

export function updateVariantRow(experiment: Experiment, variantId: string, rowId: string, changes: Partial<FormulaSnapshotRow>): Experiment {
  return updateVariant(experiment, variantId, (variant) => {
    if (!variant.snapshot.rows.some((row) => row.rowId === rowId)) throw new Error('Variant row does not exist.')
    return { ...variant, updatedAt: timestamp(), snapshot: { rows: variant.snapshot.rows.map((row) => row.rowId === rowId ? { ...row, ...clone(changes), rowId, marked: true } : row) } }
  })
}

export function addVariantRow(experiment: Experiment, variantId: string, row: Omit<FormulaSnapshotRow, 'rowId'> & { rowId?: string }): Experiment {
  return updateVariant(experiment, variantId, (variant) => {
    const used = new Set(variant.snapshot.rows.map((item) => item.rowId))
    const requested = row.rowId?.trim() ?? ''
    const rowId = requested && !used.has(requested) ? requested : newId()
    return { ...variant, updatedAt: timestamp(), snapshot: { rows: [...variant.snapshot.rows.map(clone), { ...clone(row), rowId }] } }
  })
}

export function removeVariantRow(experiment: Experiment, variantId: string, rowId: string): Experiment {
  return updateVariant(experiment, variantId, (variant) => ({ ...variant, updatedAt: timestamp(), snapshot: { rows: variant.snapshot.rows.filter((row) => row.rowId !== rowId).map(clone) } }))
}

export function updateVariantNote(experiment: Experiment, variantId: string, note: string): Experiment {
  return updateVariant(experiment, variantId, (variant) => ({ ...variant, note, updatedAt: timestamp() }))
}

export function removeVariant(experiment: Experiment, variantId: string): Experiment {
  if (!experiment.variants.some((variant) => variant.variantId === variantId)) throw new Error('Variant does not exist.')
  if (experiment.variants.some((variant) => variant.parentVariantId === variantId)) throw new Error('Cannot remove a Variant with children.')
  return { ...clone(experiment), variants: experiment.variants.filter((variant) => variant.variantId !== variantId).map(clone), updatedAt: timestamp() }
}

export function validateExperiment(experiment: Experiment): void {
  if (!experiment.experimentId.trim() || !experiment.parentFormulaId.trim()) throw new Error('Experiment identity is required.')
  if (!Number.isInteger(experiment.nextVariantOrdinal) || experiment.nextVariantOrdinal < 0) throw new Error('Invalid variant ordinal.')
  const ids = new Set<string>()
  for (const variant of experiment.variants) {
    if (!variant.variantId.trim() || ids.has(variant.variantId)) throw new Error('Variant identity must be unique.')
    ids.add(variant.variantId)
    if (variant.parentVariantId === variant.variantId || (variant.parentVariantId && !experiment.variants.some((candidate) => candidate.variantId === variant.parentVariantId))) throw new Error('Invalid parent Variant.')
    const rowIds = new Set<string>()
    for (const row of variant.snapshot.rows) { if (!row.rowId.trim() || rowIds.has(row.rowId)) throw new Error('Variant row identity must be unique.'); rowIds.add(row.rowId); if (row.parts !== '' && (!Number.isFinite(row.parts) || row.parts < 0)) throw new Error('Invalid parts.') }
  }
  for (const variant of experiment.variants) { const seen = new Set<string>(); let parent = variant.parentVariantId; while (parent) { if (seen.has(parent)) throw new Error('Variant parent cycle.'); seen.add(parent); parent = experiment.variants.find((item) => item.variantId === parent)?.parentVariantId ?? null } }
}
