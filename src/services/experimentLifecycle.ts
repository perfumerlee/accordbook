import type { Formula, FormulaSnapshotRow, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import type { Experiment, ExperimentContent, ExperimentVariant, VariantEvaluation, VariantExperimentIntent, VariantOrigin } from '../models/experiment'
import { canCreateBranchFrom } from './experimentGenealogy'
import { evaluationBranchPurpose } from './evaluationDirection'

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
  const childOrdinal = parentVariantId ? Math.max(parent!.nextChildOrdinal ?? 1, inferNextChildOrdinal(experiment, parent!)) : undefined
  const label = parentVariantId ? `${parent!.label}${parent!.parentVariantId === null ? '' : '.'}${childOrdinal}` : topLevelLabel
  const variant: ExperimentVariant = { variantId: newId(), parentVariantId, label, createdAt: now, updatedAt: now, ...(parentVariantId ? { nextChildOrdinal: 1 } : {}), snapshot: contentFromRows(rows), note: '' }
  const variants = experiment.variants.map((item) => item.variantId === parentVariantId ? { ...clone(item), nextChildOrdinal: (childOrdinal ?? 1) + 1 } : clone(item))
  return { ...clone(experiment), variants: [...variants, variant], nextVariantOrdinal: parentVariantId ? experiment.nextVariantOrdinal : experiment.nextVariantOrdinal + 1, updatedAt: now }
}

function inferNextChildOrdinal(experiment: Experiment, parent: ExperimentVariant): number {
  const prefix = parent.parentVariantId === null ? parent.label : `${parent.label}.`
  const max = experiment.variants.filter((item) => item.parentVariantId === parent.variantId).reduce((value, item) => {
    const suffix = item.label.startsWith(prefix)
      ? item.label.slice(prefix.length)
      // Older deep Branch labels concatenated the ordinal without a dot.
      : parent.parentVariantId !== null && item.label.startsWith(parent.label)
        ? item.label.slice(parent.label.length)
        : ''
    const match = /^(\d+)$/.exec(suffix)
    const ordinal = match ? Number(match[1]) : 0
    return Number.isSafeInteger(ordinal) && ordinal > value ? ordinal : value
  }, 0)
  return max + 1
}

export function addVariantFromBase(experiment: Experiment): Experiment {
  return createVariant(experiment, null, experiment.baseSnapshot.rows)
}

export function addVariantFromVariant(experiment: Experiment, parentVariantId: string, intent?: VariantExperimentIntent): Experiment {
  const parent = experiment.variants.find((variant) => variant.variantId === parentVariantId)
  if (!parent) throw new Error('Parent Variant does not exist.')
  if (!canCreateBranchFrom(experiment, parentVariantId)) throw new Error('Branch cannot be created from this Variant.')
  const next = createVariant(experiment, parentVariantId, parent.snapshot.rows)
  if (!intent) return next
  const branch = next.variants[next.variants.length - 1]
  branch.intent = normalizeVariantIntent(intent)
  return next
}

export function addVariantFromEvaluation(experiment: Experiment, parentVariantId: string, evaluationId: string, intent?: VariantExperimentIntent): Experiment {
  const parent = experiment.variants.find(item => item.variantId === parentVariantId)
  const evaluation = parent?.evaluations?.find(item => item.evaluationId === evaluationId)
  if (!evaluation) throw new Error('Evaluation does not exist.')
  const purpose = evaluationBranchPurpose(evaluation.verdict)
  if (!purpose) throw new Error('Cannot create a Branch from a finished evaluation.')
  if (!canCreateBranchFrom(experiment, parentVariantId)) throw new Error('Branch cannot be created from this Variant.')
  const next = createVariant(experiment, parentVariantId, evaluation.snapshot.rows)
  const branch = next.variants[next.variants.length - 1]
  if (intent) {
    const normalized = normalizeVariantIntent(intent)
    if (normalized.branchPurpose !== purpose) throw new Error('Branch intent purpose must match its evaluation.')
    branch.intent = normalized
  }
  branch.sourceEvaluationId = evaluationId
  branch.evaluationBranchPurpose = purpose
  branch.origin = {
    evaluationId,
    observation: evaluation.observation,
    verdict: evaluation.verdict,
    nextAction: evaluation.nextAction,
    ...(evaluation.decisionNote ? { decisionNote: evaluation.decisionNote } : {}),
    branchPurpose: purpose,
  } satisfies VariantOrigin
  branch.note = evaluation.verdict === 'continue' ? evaluation.nextAction : ''
  return next
}

function normalizeVariantIntent(intent: VariantExperimentIntent): VariantExperimentIntent {
  if (!intent || !['development', 'check', 'comparison'].includes(intent.branchPurpose) ||
      typeof intent.changeIntent !== 'string' || !intent.changeIntent.trim() ||
      typeof intent.hypothesis !== 'string' || !intent.hypothesis.trim()) throw new Error('A Branch change and hypothesis are required.')
  return { branchPurpose: intent.branchPurpose, changeIntent: intent.changeIntent.trim(), hypothesis: intent.hypothesis.trim() }
}

export type EvaluationInput = Pick<VariantEvaluation, 'observation' | 'verdict' | 'nextAction' | 'decisionNote'>
const verdicts = new Set(['continue', 'hold', 'stop', 'uncertain'])

function evaluationInput(input: EvaluationInput): EvaluationInput {
  if (typeof input.observation !== 'string' || !input.observation.trim() ||
      typeof input.nextAction !== 'string' || !verdicts.has(input.verdict) ||
      (input.decisionNote !== undefined && typeof input.decisionNote !== 'string')) throw new Error('Invalid evaluation.')
  return { observation: input.observation.trim(), verdict: input.verdict, nextAction: input.nextAction.trim(), ...(input.decisionNote !== undefined ? { decisionNote: input.decisionNote.trim() } : {}) }
}

export function addVariantEvaluation(experiment: Experiment, variantId: string, input: EvaluationInput): Experiment {
  const content = evaluationInput(input)
  return updateVariant(experiment, variantId, variant => {
    const now = timestamp()
    validateEvaluationSnapshot(variant.snapshot)
    const evaluation: VariantEvaluation = { ...content, evaluationId: newId(), createdAt: now, updatedAt: now, snapshot: clone(variant.snapshot) }
    return { ...variant, updatedAt: now, evaluations: [...(variant.evaluations ?? []), evaluation] }
  })
}

export function updateVariantEvaluation(experiment: Experiment, variantId: string, evaluationId: string, input: EvaluationInput): Experiment {
  const content = evaluationInput(input)
  return updateVariant(experiment, variantId, variant => {
    if (!variant.evaluations?.some(item => item.evaluationId === evaluationId)) throw new Error('Evaluation does not exist.')
    const now = timestamp()
    return { ...variant, updatedAt: now, evaluations: variant.evaluations.map(item => item.evaluationId === evaluationId ? { ...item, ...content, updatedAt: now } : item) }
  })
}

export function removeVariantEvaluation(experiment: Experiment, variantId: string, evaluationId: string): Experiment {
  if (experiment.variants.some(item => item.parentVariantId === variantId && item.sourceEvaluationId === evaluationId)) throw new Error('A Branch uses this evaluation.')
  return updateVariant(experiment, variantId, variant => {
    if (!variant.evaluations?.some(item => item.evaluationId === evaluationId)) throw new Error('Evaluation does not exist.')
    return { ...variant, updatedAt: timestamp(), evaluations: variant.evaluations.filter(item => item.evaluationId !== evaluationId) }
  })
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
    if (variant.evaluations !== undefined) {
      if (!Array.isArray(variant.evaluations)) throw new Error('Invalid evaluations.')
      const evaluationIds = new Set<string>()
      for (const evaluation of variant.evaluations) {
        if (!evaluation || typeof evaluation.evaluationId !== 'string' || !evaluation.evaluationId.trim() || evaluationIds.has(evaluation.evaluationId)) throw new Error('Invalid evaluation identity.')
        evaluationIds.add(evaluation.evaluationId)
        if (typeof evaluation.createdAt !== 'string' || !Number.isFinite(Date.parse(evaluation.createdAt)) || typeof evaluation.updatedAt !== 'string' || !Number.isFinite(Date.parse(evaluation.updatedAt))) throw new Error('Invalid evaluation date.')
        evaluationInput(evaluation)
        validateEvaluationSnapshot(evaluation.snapshot)
      }
    }
    if (variant.sourceEvaluationId !== undefined) {
      const parent = experiment.variants.find(item => item.variantId === variant.parentVariantId)
      if (typeof variant.sourceEvaluationId !== 'string' || !parent?.evaluations?.some(item => item.evaluationId === variant.sourceEvaluationId)) throw new Error('Invalid evaluation source.')
    }
    if (variant.evaluationBranchPurpose !== undefined && (!variant.sourceEvaluationId || !['development', 'check', 'comparison'].includes(variant.evaluationBranchPurpose))) throw new Error('Invalid evaluation Branch purpose.')
    if (variant.origin !== undefined) {
      if (!variant.sourceEvaluationId || !variant.evaluationBranchPurpose || variant.origin.evaluationId !== variant.sourceEvaluationId || variant.origin.branchPurpose !== variant.evaluationBranchPurpose || typeof variant.origin.observation !== 'string' || !variant.origin.observation.trim() || typeof variant.origin.nextAction !== 'string' || !['continue', 'hold', 'uncertain'].includes(variant.origin.verdict)) throw new Error('Invalid Variant origin.')
      if (variant.origin.decisionNote !== undefined && typeof variant.origin.decisionNote !== 'string') throw new Error('Invalid Variant origin.')
    }
    if (variant.intent !== undefined) {
      const intent = normalizeVariantIntent(variant.intent)
      if (variant.evaluationBranchPurpose && intent.branchPurpose !== variant.evaluationBranchPurpose) throw new Error('Invalid Variant intent purpose.')
    }
  }
  for (const variant of experiment.variants) { const seen = new Set<string>(); let parent = variant.parentVariantId; while (parent) { if (seen.has(parent)) throw new Error('Variant parent cycle.'); seen.add(parent); parent = experiment.variants.find((item) => item.variantId === parent)?.parentVariantId ?? null } }
}

function validateEvaluationSnapshot(snapshot: ExperimentContent): void {
  if (!snapshot || !Array.isArray(snapshot.rows)) throw new Error('Invalid evaluation snapshot.')
  const ids = new Set<string>()
  for (const row of snapshot.rows) {
    if (!row || typeof row.rowId !== 'string' || !row.rowId.trim() || ids.has(row.rowId) || typeof row.material !== 'string') throw new Error('Invalid evaluation row.')
    ids.add(row.rowId)
    if (row.parts !== '' && (typeof row.parts !== 'number' || !Number.isFinite(row.parts) || row.parts < 0)) throw new Error('Invalid evaluation parts.')
    if (row.cas !== undefined && typeof row.cas !== 'string' || row.memo !== undefined && typeof row.memo !== 'string' || row.marked !== undefined && typeof row.marked !== 'boolean') throw new Error('Invalid evaluation row fields.')
    if (row.dilution !== undefined && (!row.dilution || typeof row.dilution.enabled !== 'boolean' || typeof row.dilution.percent !== 'number' || !Number.isFinite(row.dilution.percent) || row.dilution.percent < 0 || row.dilution.percent > 100 || typeof row.dilution.solvent !== 'string')) throw new Error('Invalid evaluation dilution.')
  }
}
