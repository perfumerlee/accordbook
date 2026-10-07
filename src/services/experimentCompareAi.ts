import type { Experiment } from '../models/experiment'
import type { ExperimentCompareFactRowV1, ExperimentCompareRequestV1, ExperimentCompareResultV1, ExperimentCompareExecutionMetadata, ExperimentCompareExecutionResult, ExperimentCompareStateLabel } from '../models/experimentCompareAi'
import type { ExperimentCompareSession } from './experimentWorkspaceState'
import { buildExperimentAiDelta } from './experimentAiDelta'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'
import { aiConnection, resolveAiConnection, validAiToken, type AiConnection } from './aiClient'

export class ExperimentCompareAiError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ExperimentCompareAiError' }
}
export interface ExperimentCompareConsentReceipt {
  readonly accepted: true
  readonly scope: 'experiment_compare'
  readonly contractVersion: 1
}
export interface ExperimentComparePreparation {
  readonly request: ExperimentCompareRequestV1
  readonly metadata: ExperimentCompareExecutionMetadata
  readonly serialized: string
  readonly byteLength: number
  readonly maxRequestBytes: number
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const labels: readonly Exclude<ExperimentCompareStateLabel, 'BASE'>[] = ['V1', 'V2', 'V3', 'V4', 'V5']
const validCas = (value: string): boolean => {
  if (!/^[1-9]\d{1,6}-\d{2}-\d$/.test(value)) return false
  const digits = value.replace(/-/g, '')
  let sum = 0
  for (let i = digits.length - 2, weight = 1; i >= 0; i--, weight++) sum += Number(digits[i]) * weight
  return sum % 10 === Number(digits[digits.length - 1])
}
function fact(row: { material: string; parts: number | ''; cas?: string; dilution?: { enabled: boolean; percent: number; solvent: string } }): ExperimentCompareFactRowV1 {
  if (!row.material.trim() || typeof row.parts !== 'number' || !Number.isFinite(row.parts) || row.parts < 0 || row.material.length > 200) throw new ExperimentCompareAiError('INVALID_SELECTION')
  if (row.dilution?.enabled && (!Number.isFinite(row.dilution.percent) || row.dilution.percent < 0 || row.dilution.percent > 100 || !row.dilution.solvent.trim() || row.dilution.solvent.length > 100)) throw new ExperimentCompareAiError('INVALID_SELECTION')
  const cas = typeof row.cas === 'string' && validCas(row.cas.trim()) ? row.cas.trim() : undefined
  return { material: row.material, parts: row.parts, ...(cas ? { cas } : {}), ...(row.dilution?.enabled ? { dilution: { percent: row.dilution.percent, solvent: row.dilution.solvent } } : {}) }
}
function facts(rows: readonly { rowId: string; material: string; parts: number | ''; cas?: string; dilution?: { enabled: boolean; percent: number; solvent: string } }[]): ExperimentCompareFactRowV1[] {
  const selected = rows.filter(row => isMeaningfulFormulaRow(row))
  if (!selected.length || selected.length > 200) throw new ExperimentCompareAiError('INVALID_SELECTION')
  return selected.map(fact)
}
function compareEndpoint(connection: AiConnection): string {
  const prod = connection.endpoint === 'https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/formula-review'
  const validated = resolveAiConnection(connection.enabled ? 'true' : '', connection.endpoint, prod ? false : import.meta.env.DEV,
    prod ? 'https://accordbook.org' : (typeof window !== 'undefined' ? window.location.origin : undefined))
  if (!validated.enabled) throw new ExperimentCompareAiError('NO_ENDPOINT')
  const url = new URL(validated.endpoint)
  url.pathname = '/v1/ai/experiment-compare'
  return url.href
}

/** Pure projection of committed BASE + selected Variants; ids and notes remain local. */
export function prepareExperimentCompare(input: { experiment: Experiment; selection: ExperimentCompareSession; locale: 'ko' | 'en'; maxRequestBytes: number }): ExperimentComparePreparation {
  if (!Number.isInteger(input.maxRequestBytes) || input.maxRequestBytes < 256 || input.maxRequestBytes > 16384) throw new ExperimentCompareAiError('INVALID_LIMIT')
  const delta = buildExperimentAiDelta(input.experiment, input.selection)
  if (!delta.aiEligible || delta.variants.length < 1 || delta.variants.length > 5) throw new ExperimentCompareAiError('INELIGIBLE_COMPOSITION')
  const variantIdsByLabel: Record<string, string> = {}
  const variants = delta.variants.map((variant, index) => {
    const label = labels[index]
    variantIdsByLabel[label] = variant.variantId
    return { label, totalParts: variant.variantTotalParts, rows: facts(input.experiment.variants.find(item => item.variantId === variant.variantId)!.snapshot.rows) }
  })
  const baseRows = facts(input.experiment.baseSnapshot.rows)
  const context: ExperimentCompareRequestV1 = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_compare', locale: input.locale,
    base: { label: 'BASE', totalParts: delta.baseTotalParts, rows: baseRows },
    variants,
    deltas: delta.variants.map((variant, index) => ({
      variantLabel: labels[index], baseTotalParts: variant.baseTotalParts, variantTotalParts: variant.variantTotalParts,
      totalDeltaParts: variant.totalDeltaParts,
      changes: variant.changes.map(change => ({ kind: change.kind, identityStatus: change.identityStatus, deltaParts: change.deltaParts,
        changedFields: change.changedFields, uncertaintyCodes: [
          ...change.uncertaintyCodes,
          ...([change.before, change.after].some(row => row?.cas?.trim() && !validCas(row.cas.trim())) ? ['INVALID_CAS_REFERENCE'] : []),
        ], ...(change.before ? { before: fact(change.before) } : {}), ...(change.after ? { after: fact(change.after) } : {}) })),
    })),
  }
  const serialized = JSON.stringify(context)
  const byteLength = new TextEncoder().encode(serialized).byteLength
  if (byteLength > input.maxRequestBytes) throw new ExperimentCompareAiError('BODY_TOO_LARGE')
  const metadata: ExperimentCompareExecutionMetadata = { variantIdsByLabel: Object.freeze({ ...variantIdsByLabel }), experiment: input.experiment, selection: input.selection }
  return { request: context, metadata, serialized, byteLength, maxRequestBytes: input.maxRequestBytes }
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && !!value.trim() && value.length <= max }
function stringList(value: unknown, maxCount: number, maxLength: number): value is string[] { return Array.isArray(value) && value.length <= maxCount && value.every(item => text(item, maxLength)) }
const errorStatuses: Record<string, number> = { UNAUTHORIZED: 401, TOKEN_EXPIRED: 401, TOKEN_REVOKED: 401, INVALID_REQUEST: 400, INVALID_JSON: 400, BODY_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, ORIGIN_FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429, QUOTA_EXCEEDED: 429, GLOBAL_LIMIT: 429, ALREADY_RUNNING: 409, DUPLICATE_REQUEST: 409, SERVICE_UNAVAILABLE: 503, RUNNER_FAILED: 502, RUN_TIMEOUT: 504, INVALID_RESULT: 502, INTERNAL_ERROR: 500 }
export function parseExperimentCompareResponse(value: unknown, status: number, metadata: ExperimentCompareExecutionMetadata): ExperimentCompareResultV1 {
  if (!object(value) || !text(value.requestId, 36) || !uuid.test(value.requestId)) throw new ExperimentCompareAiError('INVALID_RESPONSE')
  if (status !== 200) {
    if (exact(value, ['requestId', 'error']) && object(value.error) && exact(value.error, ['code', 'retryable']) && typeof value.error.code === 'string' && errorStatuses[value.error.code] === status && typeof value.error.retryable === 'boolean') throw new ExperimentCompareAiError(value.error.code)
    throw new ExperimentCompareAiError('INVALID_RESPONSE')
  }
  const result = value.result
  if (!exact(value, ['requestId', 'result']) || !object(result) || !exact(result, ['summary', 'variants', 'overallUncertainties', 'overallSmellingChecks']) || !text(result.summary, 1200) || !Array.isArray(result.variants) || result.variants.length !== Object.keys(metadata.variantIdsByLabel).length || !stringList(result.overallUncertainties, 8, 500) || !stringList(result.overallSmellingChecks, 8, 500)) throw new ExperimentCompareAiError('INVALID_RESPONSE')
  const seen = new Set<string>()
  for (const item of result.variants) {
    if (!object(item) || !exact(item, ['variantLabel', 'hypothesis', 'uncertainties', 'smellingChecks']) || typeof item.variantLabel !== 'string' || !Object.prototype.hasOwnProperty.call(metadata.variantIdsByLabel, item.variantLabel) || seen.has(item.variantLabel) || !text(item.hypothesis, 1000) || !stringList(item.uncertainties, 8, 500) || !stringList(item.smellingChecks, 8, 500)) throw new ExperimentCompareAiError('INVALID_RESPONSE')
    seen.add(item.variantLabel)
  }
  if (seen.size !== Object.keys(metadata.variantIdsByLabel).length) throw new ExperimentCompareAiError('INVALID_RESPONSE')
  return result as unknown as ExperimentCompareResultV1
}

/** Must only be called by a future UI after explicit Experiment Compare disclosure acceptance. */
export async function executeExperimentCompare(input: {
  connection?: AiConnection; preparation: ExperimentComparePreparation; consent: ExperimentCompareConsentReceipt; token: string;
  signal: AbortSignal; idempotencyKey?: string; timeoutMs?: number; fetcher?: typeof fetch;
}): Promise<ExperimentCompareExecutionResult> {
  if (!input.consent || input.consent.accepted !== true || input.consent.scope !== 'experiment_compare' || input.consent.contractVersion !== 1) throw new ExperimentCompareAiError('CONSENT_REQUIRED')
  const connection = input.connection ?? aiConnection
  const endpoint = compareEndpoint(connection)
  if (!validAiToken(input.token)) throw new ExperimentCompareAiError('NO_TOKEN')
  const key = input.idempotencyKey ?? crypto.randomUUID()
  if (!uuid.test(key)) throw new ExperimentCompareAiError('INVALID_REQUEST')
  const { request, metadata, byteLength, maxRequestBytes } = input.preparation
  const body = JSON.stringify(request)
  const actualBytes = new TextEncoder().encode(body).byteLength
  if (input.signal.aborted) throw new ExperimentCompareAiError('ABORTED')
  if (!Number.isInteger(maxRequestBytes) || maxRequestBytes < 256 || maxRequestBytes > 16384 || actualBytes > maxRequestBytes) throw new ExperimentCompareAiError('BODY_TOO_LARGE')
  if (byteLength !== actualBytes || body !== input.preparation.serialized) throw new ExperimentCompareAiError('INVALID_REQUEST')
  const controller = new AbortController()
  const abort = () => controller.abort()
  input.signal.addEventListener('abort', abort, { once: true }); if (input.signal.aborted) abort()
  const timer = setTimeout(abort, input.timeoutMs ?? 35000)
  try {
    const response = await (input.fetcher ?? fetch)(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.token}`, 'Idempotency-Key': key }, body, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal })
    if (!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? '')) throw new ExperimentCompareAiError('INVALID_RESPONSE')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 65536)) throw new ExperimentCompareAiError('RESPONSE_TOO_LARGE')
    if (!response.body) throw new ExperimentCompareAiError('INVALID_RESPONSE')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        if (controller.signal.aborted) throw new ExperimentCompareAiError(input.signal.aborted ? 'ABORTED' : 'TIMEOUT')
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 65536) { void reader.cancel().catch(() => {}); throw new ExperimentCompareAiError('RESPONSE_TOO_LARGE') }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let parsed: unknown
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new ExperimentCompareAiError('INVALID_RESPONSE') }
    return { result: parseExperimentCompareResponse(parsed, response.status, metadata), metadata }
  } catch (error) {
    if (controller.signal.aborted) throw new ExperimentCompareAiError(input.signal.aborted ? 'ABORTED' : 'TIMEOUT')
    if (error instanceof ExperimentCompareAiError) throw error
    throw new ExperimentCompareAiError('NETWORK')
  } finally { clearTimeout(timer); input.signal.removeEventListener('abort', abort); controller.abort() }
}
