import type { EvaluationVerdict } from './experiment'
import type { ExperimentCompareFactRowV1 } from './experimentCompareAi'

export interface ExperimentNextRoundRequestV1 {
  readonly type: 'accordbook-ai-context'
  readonly version: 1
  readonly scope: 'experiment_next_round'
  readonly locale: 'ko' | 'en'
  readonly disclosureVersion: 1
  readonly base: { readonly totalParts: number; readonly rows: readonly ExperimentCompareFactRowV1[] }
  readonly evaluated: { readonly totalParts: number; readonly rows: readonly ExperimentCompareFactRowV1[] }
  readonly delta: {
    readonly baseTotalParts: number
    readonly evaluatedTotalParts: number
    readonly totalDeltaParts: number
    readonly changes: readonly {
      readonly kind: 'added' | 'removed' | 'unchanged' | 'adjusted' | 'replacement' | 'identity-uncertain'
      readonly identityStatus: 'row-lineage' | 'heuristic-match' | 'unmatched' | 'ambiguous' | 'conflicting-cas' | 'replacement-on-lineage'
      readonly deltaParts: number
      readonly changedFields: readonly ('material' | 'cas' | 'parts' | 'dilution')[]
      readonly uncertaintyCodes: readonly string[]
      readonly before?: ExperimentCompareFactRowV1
      readonly after?: ExperimentCompareFactRowV1
    }[]
  }
  readonly evaluation: {
    readonly observation: string
    readonly verdict: EvaluationVerdict
    readonly nextAction: string
    readonly decisionNote?: string
  }
}

export interface ExperimentNextRoundResultV1 {
  readonly findings: string
  readonly uncertainties: readonly string[]
  readonly nextChecks: readonly string[]
  readonly adjustmentDirections: readonly string[]
  readonly advisoryOnly: true
}

export interface ExperimentNextRoundReviewRecord {
  readonly reviewId: string
  readonly reviewType: 'experiment'
  readonly operation: 'next_round'
  readonly schemaVersion: 1
  readonly experimentId: string
  readonly experimentDisplayName: string
  readonly variantId: string
  readonly variantLabel: string
  readonly evaluationId: string
  readonly submittedContext: ExperimentNextRoundRequestV1
  readonly deterministicDelta: ExperimentNextRoundRequestV1['delta']
  readonly response: ExperimentNextRoundResultV1
  readonly locale: 'en' | 'ko'
  readonly createdAt: string
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max
const list = (value: unknown, count: number, length: number) => Array.isArray(value) && value.length <= count && value.every(item => text(item, length))
function validFact(value: unknown): value is ExperimentCompareFactRowV1 {
  if (!object(value) || !Object.keys(value).every(key => ['material', 'parts', 'cas', 'dilution'].includes(key)) || !text(value.material, 200) || typeof value.parts !== 'number' || !Number.isFinite(value.parts) || value.parts < 0) return false
  if (value.cas !== undefined && (typeof value.cas !== 'string' || !/^[1-9]\d{1,6}-\d{2}-\d$/.test(value.cas))) return false
  return value.dilution === undefined || (object(value.dilution) && exact(value.dilution, ['percent', 'solvent']) && typeof value.dilution.percent === 'number' && Number.isFinite(value.dilution.percent) && value.dilution.percent >= 0 && value.dilution.percent <= 100 && text(value.dilution.solvent, 100))
}
function validContext(value: unknown): value is ExperimentNextRoundRequestV1 {
  if (!object(value) || !exact(value, ['type', 'version', 'scope', 'locale', 'disclosureVersion', 'base', 'evaluated', 'delta', 'evaluation']) || value.type !== 'accordbook-ai-context' || value.version !== 1 || value.scope !== 'experiment_next_round' || value.disclosureVersion !== 1 || !['ko', 'en'].includes(String(value.locale))) return false
  const composition = (candidate: unknown) => object(candidate) && exact(candidate, ['totalParts', 'rows']) && typeof candidate.totalParts === 'number' && Number.isFinite(candidate.totalParts) && candidate.totalParts > 0 && Array.isArray(candidate.rows) && candidate.rows.length > 0 && candidate.rows.length <= 200 && candidate.rows.every(validFact) && candidate.rows.reduce((sum, row) => sum + (row as ExperimentCompareFactRowV1).parts, 0) === candidate.totalParts
  if (!composition(value.base) || !composition(value.evaluated) || !object(value.delta) || !exact(value.delta, ['baseTotalParts', 'evaluatedTotalParts', 'totalDeltaParts', 'changes']) || !Array.isArray(value.delta.changes) || value.delta.changes.length < 1 || value.delta.changes.length > 400) return false
  if (value.delta.baseTotalParts !== (value.base as { totalParts: number }).totalParts || value.delta.evaluatedTotalParts !== (value.evaluated as { totalParts: number }).totalParts || value.delta.totalDeltaParts !== value.delta.evaluatedTotalParts - value.delta.baseTotalParts) return false
  const changeKinds = ['added', 'removed', 'unchanged', 'adjusted', 'replacement', 'identity-uncertain']
  const identity = ['row-lineage', 'heuristic-match', 'unmatched', 'ambiguous', 'conflicting-cas', 'replacement-on-lineage']
  if (!value.delta.changes.every(change => object(change) && Object.keys(change).every(key => ['kind', 'identityStatus', 'deltaParts', 'changedFields', 'uncertaintyCodes', 'before', 'after'].includes(key)) && changeKinds.includes(String(change.kind)) && identity.includes(String(change.identityStatus)) && typeof change.deltaParts === 'number' && Number.isFinite(change.deltaParts) && Array.isArray(change.changedFields) && change.changedFields.every(field => ['material', 'cas', 'parts', 'dilution'].includes(String(field))) && list(change.uncertaintyCodes, 8, 80) && (change.before === undefined || validFact(change.before)) && (change.after === undefined || validFact(change.after)) && (change.before !== undefined || change.after !== undefined))) return false
  const evaluation = value.evaluation
  return object(evaluation) && (exact(evaluation, ['observation', 'verdict', 'nextAction']) || exact(evaluation, ['observation', 'verdict', 'nextAction', 'decisionNote'])) && text(evaluation.observation, 4000) && ['continue', 'hold', 'stop', 'uncertain'].includes(String(evaluation.verdict)) && typeof evaluation.nextAction === 'string' && evaluation.nextAction.length <= 4000 && (evaluation.decisionNote === undefined || text(evaluation.decisionNote, 4000))
}
function validResult(value: unknown): value is ExperimentNextRoundResultV1 {
  return object(value) && exact(value, ['findings', 'uncertainties', 'nextChecks', 'adjustmentDirections', 'advisoryOnly']) && text(value.findings, 1200) && list(value.uncertainties, 8, 500) && list(value.nextChecks, 8, 500) && list(value.adjustmentDirections, 8, 500) && value.advisoryOnly === true
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function validateExperimentNextRoundReviewRecord(value: unknown): asserts value is ExperimentNextRoundReviewRecord {
  if (!object(value) || !exact(value, ['reviewId', 'reviewType', 'operation', 'schemaVersion', 'experimentId', 'experimentDisplayName', 'variantId', 'variantLabel', 'evaluationId', 'submittedContext', 'deterministicDelta', 'response', 'locale', 'createdAt']) || typeof value.reviewId !== 'string' || !uuidV4.test(value.reviewId) || value.reviewType !== 'experiment' || value.operation !== 'next_round' || value.schemaVersion !== 1 || !text(value.experimentId, 200) || typeof value.experimentDisplayName !== 'string' || value.experimentDisplayName.length > 300 || !text(value.variantId, 200) || !text(value.variantLabel, 100) || !text(value.evaluationId, 200) || !validContext(value.submittedContext) || value.locale !== value.submittedContext.locale || stableJson(value.deterministicDelta) !== stableJson(value.submittedContext.delta) || !validResult(value.response) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) throw new Error('Invalid Experiment Next Round Review record.')
}
