import type { AIContextV1 } from './aiContext'
import type { AiReview } from '../services/aiClient'
import type { ExperimentAiCompareReviewRecord } from './experimentAiReviewRecord'
import type { ExperimentNextRoundReviewRecord } from './experimentNextRoundAi'

export type ExperimentAiReviewRecord = ExperimentAiCompareReviewRecord | ExperimentNextRoundReviewRecord
export type AiReviewRecord = FormulaAiReviewRecord | ExperimentAiReviewRecord

/** A locally persisted copy of one validated Formula Review exchange. */
export interface FormulaAiReviewRecord {
  readonly reviewId: string
  readonly reviewType: 'formula'
  readonly sourceFormulaId: string
  readonly sourceFormulaDisplayId?: string
  /** Exact context sent to the provider; never rebuild this from a live Formula. */
  readonly snapshot: AIContextV1
  readonly response: AiReview
  readonly locale: 'en' | 'ko'
  readonly createdAt: string
  readonly schemaVersion: 1
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key))
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
function validCas(value: string): boolean {
  if (!/^[1-9]\d{1,6}-\d{2}-\d$/.test(value)) return false
  const digits = value.replace(/-/g, '')
  let sum = 0
  for (let i = digits.length - 2, weight = 1; i >= 0; i--, weight++) sum += Number(digits[i]) * weight
  return sum % 10 === Number(digits[digits.length - 1])
}

export function isAiContextSnapshot(value: unknown): value is AIContextV1 {
  if (!isObject(value) || !hasOnly(value, ['type', 'version', 'scope', 'formula']) || value.type !== 'accordbook-ai-context' || value.version !== 1 || value.scope !== 'formula_review' || !isObject(value.formula)) return false
  const formula = value.formula
  if (!hasOnly(formula, ['name', 'notes', 'rows']) || !Array.isArray(formula.rows) || formula.rows.length < 1 || formula.rows.length > 200) return false
  if (Object.prototype.hasOwnProperty.call(formula, 'name') && (typeof formula.name !== 'string' || formula.name.length > 120)) return false
  if (Object.prototype.hasOwnProperty.call(formula, 'notes') && (typeof formula.notes !== 'string' || formula.notes.length > 4000)) return false
  return formula.rows.every(row => {
    if (!isObject(row) || !hasOnly(row, ['material', 'parts', 'cas', 'dilution']) || !text(row.material, 200) || typeof row.parts !== 'number' || !Number.isFinite(row.parts) || row.parts < 0) return false
    if (row.cas !== undefined && (typeof row.cas !== 'string' || !validCas(row.cas))) return false
    if (row.dilution !== undefined && (!isObject(row.dilution) || !hasOnly(row.dilution, ['percent', 'solvent']) || typeof row.dilution.percent !== 'number' || !Number.isFinite(row.dilution.percent) || row.dilution.percent < 0 || row.dilution.percent > 100 || !text(row.dilution.solvent, 100))) return false
    return true
  }) && Number.isFinite(formula.rows.reduce((sum, row) => sum + (row as { parts: number }).parts, 0)) && formula.rows.some(row => (row as { parts: number }).parts > 0)
}

export function isAiReviewResponse(value: unknown): value is AiReview {
  if (!isObject(value) || !hasOnly(value, ['summary', 'observations', 'nextChecks']) || !text(value.summary, 1200)) return false
  const details = (items: unknown, maxCount: number, maxText: number) => Array.isArray(items) && items.length <= maxCount && items.every(item => isObject(item) && hasOnly(item, ['detail']) && text(item.detail, maxText))
  return details(value.observations, 8, 800) && details(value.nextChecks, 5, 500)
}

export function validateFormulaAiReviewRecord(value: unknown): asserts value is FormulaAiReviewRecord {
  if (!isObject(value) || !hasOnly(value, ['reviewId', 'reviewType', 'sourceFormulaId', 'sourceFormulaDisplayId', 'snapshot', 'response', 'locale', 'createdAt', 'schemaVersion']) ||
    typeof value.reviewId !== 'string' || !uuidV4.test(value.reviewId) || value.reviewType !== 'formula' ||
    !text(value.sourceFormulaId, 200) || (value.sourceFormulaDisplayId !== undefined && !text(value.sourceFormulaDisplayId, 200)) ||
    !isAiContextSnapshot(value.snapshot) || !isAiReviewResponse(value.response) || (value.locale !== 'en' && value.locale !== 'ko') ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt || value.schemaVersion !== 1) {
    throw new Error('Invalid Formula AI Review record.')
  }
}
