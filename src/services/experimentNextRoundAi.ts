import type { Experiment, VariantEvaluation } from '../models/experiment'
import type { ExperimentNextRoundRequestV1, ExperimentNextRoundResultV1 } from '../models/experimentNextRoundAi'
import type { ExperimentCompareFactRowV1 } from '../models/experimentCompareAi'
import { buildExperimentAiDeltaForSnapshots } from './experimentAiDelta'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'
import { aiConnection, resolveAiConnection, validAiToken, type AiConnection } from './aiClient'

export class ExperimentNextRoundAiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ExperimentNextRoundAiError' }
}
export interface ExperimentNextRoundConsentReceipt { readonly accepted: true; readonly scope: 'experiment_next_round'; readonly contractVersion: 1 }
export interface ExperimentNextRoundPreparation {
  readonly request: ExperimentNextRoundRequestV1; readonly metadata: ExperimentNextRoundMetadata
  readonly serialized: string; readonly byteLength: number; readonly maxRequestBytes: number
}
export interface ExperimentNextRoundMetadata {
  readonly experimentId: string; readonly experimentDisplayName: string; readonly variantId: string; readonly variantLabel: string; readonly evaluationId: string
}
export interface ExperimentNextRoundPreparation {
  readonly request: ExperimentNextRoundRequestV1; readonly metadata: ExperimentNextRoundMetadata
  readonly serialized: string; readonly byteLength: number; readonly maxRequestBytes: number
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const allowedTop = ['type', 'version', 'scope', 'locale', 'disclosureVersion', 'base', 'evaluated', 'delta', 'evaluation']
const validCas = (value: string): boolean => {
  if (!/^[1-9]\d{1,6}-\d{2}-\d$/.test(value)) return false
  const digits = value.replace(/-/g, ''); let sum = 0
  for (let i = digits.length - 2, weight = 1; i >= 0; i--, weight++) sum += Number(digits[i]) * weight
  return sum % 10 === Number(digits[digits.length - 1])
}
function fact(row: { material: string; parts: number | ''; cas?: string; dilution?: { enabled: boolean; percent: number; solvent: string } }): ExperimentCompareFactRowV1 {
  if (!row.material.trim() || typeof row.parts !== 'number' || !Number.isFinite(row.parts) || row.parts < 0 || row.material.length > 200) throw new ExperimentNextRoundAiError('INVALID_EVALUATION')
  if (row.dilution?.enabled && (!Number.isFinite(row.dilution.percent) || row.dilution.percent < 0 || row.dilution.percent > 100 || !row.dilution.solvent.trim() || row.dilution.solvent.length > 100)) throw new ExperimentNextRoundAiError('INVALID_EVALUATION')
  const cas = typeof row.cas === 'string' && validCas(row.cas.trim()) ? row.cas.trim() : undefined
  return { material: row.material, parts: row.parts, ...(cas ? { cas } : {}), ...(row.dilution?.enabled ? { dilution: { percent: row.dilution.percent, solvent: row.dilution.solvent } } : {}) }
}
function facts(rows: readonly { rowId: string; material: string; parts: number | ''; cas?: string; dilution?: { enabled: boolean; percent: number; solvent: string } }[]): ExperimentCompareFactRowV1[] {
  const selected = rows.filter(isMeaningfulFormulaRow)
  if (!selected.length || selected.length > 200) throw new ExperimentNextRoundAiError('INVALID_EVALUATION')
  return selected.map(fact)
}
function endpoint(connection: AiConnection): string {
  const production = connection.endpoint === 'https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/formula-review'
  const validated = resolveAiConnection(connection.enabled ? 'true' : '', connection.endpoint, production ? false : import.meta.env.DEV,
    production ? 'https://accordbook.org' : (typeof window !== 'undefined' ? window.location.origin : undefined))
  if (!validated.enabled) throw new ExperimentNextRoundAiError('NO_ENDPOINT')
  const url = new URL(validated.endpoint); url.pathname = '/v1/ai/experiment-next-round'; return url.href
}

/** Captures one persisted Evaluation and its immutable snapshot; the live Variant is never used as review composition. */
export function prepareExperimentNextRound(input: { experiment: Experiment; variantId: string; evaluationId: string; locale: 'ko' | 'en'; includeDecisionNote?: boolean; maxRequestBytes: number }): ExperimentNextRoundPreparation {
  if (!Number.isInteger(input.maxRequestBytes) || input.maxRequestBytes < 256 || input.maxRequestBytes > 16384) throw new ExperimentNextRoundAiError('INVALID_LIMIT')
  const variant = input.experiment.variants.find(item => item.variantId === input.variantId)
  const evaluation: VariantEvaluation | undefined = variant?.evaluations?.find(item => item.evaluationId === input.evaluationId)
  if (!variant || !evaluation) throw new ExperimentNextRoundAiError('EVALUATION_UNAVAILABLE')
  if (!evaluation.observation.trim() || evaluation.observation.length > 4000 || evaluation.nextAction.length > 4000 || (evaluation.decisionNote?.length ?? 0) > 4000) throw new ExperimentNextRoundAiError('INVALID_EVALUATION')
  const base = facts(input.experiment.baseSnapshot.rows)
  const evaluated = facts(evaluation.snapshot.rows)
  const delta = buildExperimentAiDeltaForSnapshots(input.experiment.baseSnapshot, evaluation.snapshot)
  const projectDeltaRow = (row: typeof delta.changes[number]) => ({ kind: row.kind, identityStatus: row.identityStatus, deltaParts: row.deltaParts,
    changedFields: row.changedFields, uncertaintyCodes: [...row.uncertaintyCodes, ...([row.before, row.after].some(item => item?.cas?.trim() && !validCas(item.cas.trim())) ? ['INVALID_CAS_REFERENCE'] : [])],
    ...(row.before ? { before: fact(row.before) } : {}), ...(row.after ? { after: fact(row.after) } : {}) })
  const context: ExperimentNextRoundRequestV1 = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_next_round', locale: input.locale, disclosureVersion: 1,
    base: { totalParts: delta.baseTotalParts, rows: base }, evaluated: { totalParts: delta.evaluatedTotalParts, rows: evaluated },
    delta: { baseTotalParts: delta.baseTotalParts, evaluatedTotalParts: delta.evaluatedTotalParts, totalDeltaParts: delta.totalDeltaParts, changes: delta.changes.map(projectDeltaRow) },
    evaluation: { observation: evaluation.observation, verdict: evaluation.verdict, nextAction: evaluation.nextAction,
      ...(input.includeDecisionNote && evaluation.decisionNote?.trim() ? { decisionNote: evaluation.decisionNote } : {}) },
  }
  const serialized = JSON.stringify(context); const byteLength = new TextEncoder().encode(serialized).byteLength
  if (byteLength > input.maxRequestBytes) throw new ExperimentNextRoundAiError('BODY_TOO_LARGE')
  const metadata = Object.freeze({ experimentId: input.experiment.experimentId, experimentDisplayName: input.experiment.name, variantId: variant.variantId, variantLabel: variant.label, evaluationId: evaluation.evaluationId })
  return { request: context, metadata, serialized, byteLength, maxRequestBytes: input.maxRequestBytes }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
const text = (value: unknown, max: number) => typeof value === 'string' && !!value.trim() && value.length <= max
const stringList = (value: unknown, max: number, length: number) => Array.isArray(value) && value.length <= max && value.every(item => text(item, length))
const errorStatuses: Record<string, number> = { UNAUTHORIZED: 401, TOKEN_EXPIRED: 401, TOKEN_REVOKED: 401, INVALID_REQUEST: 400, INVALID_JSON: 400, BODY_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, ORIGIN_FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429, QUOTA_EXCEEDED: 429, GLOBAL_LIMIT: 429, ALREADY_RUNNING: 409, DUPLICATE_REQUEST: 409, SERVICE_UNAVAILABLE: 503, RUNNER_FAILED: 502, RUN_TIMEOUT: 504, INVALID_RESULT: 502, INTERNAL_ERROR: 500 }
export function parseExperimentNextRoundResponse(value: unknown, status: number): ExperimentNextRoundResultV1 {
  if (!object(value) || typeof value.requestId !== 'string' || !text(value.requestId, 36) || !uuid.test(value.requestId)) throw new ExperimentNextRoundAiError('INVALID_RESPONSE')
  if (status !== 200) { if (exact(value, ['requestId', 'error']) && object(value.error) && exact(value.error, ['code', 'retryable']) && typeof value.error.code === 'string' && errorStatuses[value.error.code] === status && typeof value.error.retryable === 'boolean') throw new ExperimentNextRoundAiError(value.error.code); throw new ExperimentNextRoundAiError('INVALID_RESPONSE') }
  const result = value.result
  if (!exact(value, ['requestId', 'result']) || !object(result) || !exact(result, ['findings', 'uncertainties', 'nextChecks', 'adjustmentDirections', 'advisoryOnly']) || !text(result.findings, 1200) || !stringList(result.uncertainties, 8, 500) || !stringList(result.nextChecks, 8, 500) || !stringList(result.adjustmentDirections, 8, 500) || result.advisoryOnly !== true) throw new ExperimentNextRoundAiError('INVALID_RESPONSE')
  return result as unknown as ExperimentNextRoundResultV1
}
export async function executeExperimentNextRound(input: { connection?: AiConnection; preparation: ExperimentNextRoundPreparation; consent: ExperimentNextRoundConsentReceipt; token: string; signal: AbortSignal; idempotencyKey?: string; timeoutMs?: number; fetcher?: typeof fetch }): Promise<ExperimentNextRoundResultV1> {
  if (input.consent?.accepted !== true || input.consent.scope !== 'experiment_next_round' || input.consent.contractVersion !== 1) throw new ExperimentNextRoundAiError('CONSENT_REQUIRED')
  const url = endpoint(input.connection ?? aiConnection)
  if (!validAiToken(input.token)) throw new ExperimentNextRoundAiError('NO_TOKEN')
  const key = input.idempotencyKey ?? crypto.randomUUID(); if (!uuid.test(key)) throw new ExperimentNextRoundAiError('INVALID_REQUEST')
  const { request, serialized, byteLength, maxRequestBytes } = input.preparation
  if (JSON.stringify(request) !== serialized || new TextEncoder().encode(serialized).byteLength !== byteLength || byteLength > maxRequestBytes || input.signal.aborted) throw new ExperimentNextRoundAiError(input.signal.aborted ? 'ABORTED' : 'INVALID_REQUEST')
  const controller = new AbortController(); const abort = () => controller.abort(); input.signal.addEventListener('abort', abort, { once: true }); if (input.signal.aborted) abort()
  const timer = setTimeout(abort, input.timeoutMs ?? 35000)
  try {
    const response = await (input.fetcher ?? fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}`, 'Idempotency-Key': key }, body: serialized, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal })
    if (!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new ExperimentNextRoundAiError('INVALID_RESPONSE')
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { if (controller.signal.aborted) throw new ExperimentNextRoundAiError(input.signal.aborted ? 'ABORTED' : 'TIMEOUT'); const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 65536) { void reader.cancel().catch(() => {}); throw new ExperimentNextRoundAiError('RESPONSE_TOO_LARGE') } chunks.push(part.value) } } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let parsed: unknown; try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new ExperimentNextRoundAiError('INVALID_RESPONSE') }
    return parseExperimentNextRoundResponse(parsed, response.status)
  } catch (error) { if (controller.signal.aborted) throw new ExperimentNextRoundAiError(input.signal.aborted ? 'ABORTED' : 'TIMEOUT'); if (error instanceof ExperimentNextRoundAiError) throw error; throw new ExperimentNextRoundAiError('NETWORK') }
  finally { clearTimeout(timer); input.signal.removeEventListener('abort', abort); controller.abort() }
}
