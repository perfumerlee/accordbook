import type { ExperimentCompareRequestV1, ExperimentCompareResultV1 } from './experimentCompareAi'

export interface ExperimentAiCompareReviewRecord {
  readonly reviewId: string
  readonly reviewType: 'experiment'
  readonly operation: 'compare'
  readonly schemaVersion: 1
  readonly experimentId: string
  readonly experimentDisplayName: string
  readonly selectedVariantIds: readonly string[]
  readonly selectedVariantLabels: readonly string[]
  readonly variantIdsByLabel: Readonly<Record<string, string>>
  /** Exact sanitized context submitted; never reconstructed from current Experiment state. */
  readonly submittedContext: ExperimentCompareRequestV1
  /** Deterministic delta included in the submitted request. */
  readonly deterministicDelta: ExperimentCompareRequestV1['deltas']
  readonly response: ExperimentCompareResultV1
  readonly locale: 'en' | 'ko'
  readonly createdAt: string
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max
const list = (value: unknown, max: number, maxLength: number) => Array.isArray(value) && value.length <= max && value.every(item => text(item, maxLength))
const labels = ['V1', 'V2', 'V3', 'V4', 'V5'] as const

function validFact(value: unknown): boolean {
  if (!object(value) || !Object.keys(value).every(key => ['material', 'parts', 'cas', 'dilution'].includes(key)) || !text(value.material, 200) || typeof value.parts !== 'number' || !Number.isFinite(value.parts) || value.parts < 0) return false
  if (value.cas !== undefined && (typeof value.cas !== 'string' || !/^[1-9]\d{1,6}-\d{2}-\d$/.test(value.cas))) return false
  return value.dilution === undefined || (object(value.dilution) && exact(value.dilution, ['percent', 'solvent']) && typeof value.dilution.percent === 'number' && Number.isFinite(value.dilution.percent) && value.dilution.percent >= 0 && value.dilution.percent <= 100 && text(value.dilution.solvent, 100))
}
function validContext(value: unknown): value is ExperimentCompareRequestV1 {
  if (!object(value) || !exact(value, ['type', 'version', 'scope', 'locale', 'base', 'variants', 'deltas']) || value.type !== 'accordbook-ai-context' || value.version !== 1 || value.scope !== 'experiment_compare' || (value.locale !== 'en' && value.locale !== 'ko')) return false
  if (!object(value.base) || !exact(value.base, ['label', 'totalParts', 'rows']) || value.base.label !== 'BASE' || typeof value.base.totalParts !== 'number' || !Number.isFinite(value.base.totalParts) || !Array.isArray(value.base.rows) || value.base.rows.length < 1 || value.base.rows.length > 200 || !value.base.rows.every(validFact)) return false
  if (!Array.isArray(value.variants) || value.variants.length < 1 || value.variants.length > 5 || !Array.isArray(value.deltas) || value.deltas.length !== value.variants.length) return false
  const expected = labels.slice(0, value.variants.length)
  if (!value.variants.every((variant, i) => object(variant) && exact(variant, ['label', 'totalParts', 'rows']) && variant.label === expected[i] && typeof variant.totalParts === 'number' && Number.isFinite(variant.totalParts) && Array.isArray(variant.rows) && variant.rows.length > 0 && variant.rows.length <= 200 && variant.rows.every(validFact))) return false
  return value.deltas.every((delta, i) => {
    if (!object(delta) || !exact(delta, ['variantLabel', 'baseTotalParts', 'variantTotalParts', 'totalDeltaParts', 'changes']) || delta.variantLabel !== expected[i] || ![delta.baseTotalParts, delta.variantTotalParts, delta.totalDeltaParts].every(n => typeof n === 'number' && Number.isFinite(n)) || !Array.isArray(delta.changes) || delta.changes.length > 400) return false
    return delta.changes.every(change => object(change) && Object.keys(change).every(key => ['kind', 'identityStatus', 'deltaParts', 'changedFields', 'uncertaintyCodes', 'before', 'after'].includes(key)) && ['added', 'removed', 'unchanged', 'adjusted', 'replacement', 'identity-uncertain'].includes(String(change.kind)) && ['row-lineage', 'heuristic-match', 'unmatched', 'ambiguous', 'conflicting-cas', 'replacement-on-lineage'].includes(String(change.identityStatus)) && typeof change.deltaParts === 'number' && Number.isFinite(change.deltaParts) && Array.isArray(change.changedFields) && change.changedFields.every(field => ['material', 'cas', 'parts', 'dilution'].includes(String(field))) && list(change.uncertaintyCodes, 20, 80) && (change.before === undefined || validFact(change.before)) && (change.after === undefined || validFact(change.after)))
  })
}
function validResult(value: unknown, expectedLabels: readonly string[]): value is ExperimentCompareResultV1 {
  if (!object(value) || !exact(value, ['summary', 'variants', 'overallUncertainties', 'overallSmellingChecks']) || !text(value.summary, 1200) || !Array.isArray(value.variants) || value.variants.length !== expectedLabels.length || !list(value.overallUncertainties, 8, 500) || !list(value.overallSmellingChecks, 8, 500)) return false
  const seen = new Set<string>()
  return value.variants.every(item => {
    if (!object(item) || !exact(item, ['variantLabel', 'hypothesis', 'uncertainties', 'smellingChecks']) || typeof item.variantLabel !== 'string' || !expectedLabels.includes(item.variantLabel) || seen.has(item.variantLabel) || !text(item.hypothesis, 1000) || !list(item.uncertainties, 8, 500) || !list(item.smellingChecks, 8, 500)) return false
    seen.add(item.variantLabel)
    return true
  }) && seen.size === expectedLabels.length
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function validateExperimentAiCompareReviewRecord(value: unknown): asserts value is ExperimentAiCompareReviewRecord {
  if (!object(value)) throw new Error('Invalid Experiment AI Review record.')
  const root = value
  const invalid = (): never => { throw new Error('Invalid Experiment AI Review record.') }
  if (!exact(root, ['reviewId', 'reviewType', 'operation', 'schemaVersion', 'experimentId', 'experimentDisplayName', 'selectedVariantIds', 'selectedVariantLabels', 'variantIdsByLabel', 'submittedContext', 'deterministicDelta', 'response', 'locale', 'createdAt']) || typeof root.reviewId !== 'string' || !uuidV4.test(root.reviewId) || root.reviewType !== 'experiment' || root.operation !== 'compare' || root.schemaVersion !== 1 || !text(root.experimentId, 200) || typeof root.experimentDisplayName !== 'string' || root.experimentDisplayName.length > 300 || !Array.isArray(root.selectedVariantIds) || root.selectedVariantIds.length < 1 || root.selectedVariantIds.length > 5 || !root.selectedVariantIds.every(id => text(id, 200)) || new Set(root.selectedVariantIds).size !== root.selectedVariantIds.length || !Array.isArray(root.selectedVariantLabels) || root.selectedVariantLabels.length !== root.selectedVariantIds.length || !root.selectedVariantLabels.every(label => text(label, 100))) invalid()
  const selectedVariantIds = root.selectedVariantIds as string[]
  if (!validContext(root.submittedContext) || root.locale !== root.submittedContext.locale || stableJson(root.deterministicDelta) !== stableJson(root.submittedContext.deltas)) invalid()
  if (!object(root.variantIdsByLabel)) invalid()
  const variantIdsByLabel = root.variantIdsByLabel as Record<string, unknown>
  if (!exact(variantIdsByLabel, labels.slice(0, selectedVariantIds.length)) || !labels.slice(0, selectedVariantIds.length).every((label, index) => variantIdsByLabel[label] === selectedVariantIds[index])) invalid()
  if (!validResult(root.response, labels.slice(0, selectedVariantIds.length)) || typeof root.createdAt !== 'string' || !Number.isFinite(Date.parse(root.createdAt)) || new Date(root.createdAt).toISOString() !== root.createdAt) invalid()
}
