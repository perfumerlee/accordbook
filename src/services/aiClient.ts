import type { AIContextV1 } from '../models/aiContext'

export interface AiConnection { readonly enabled: boolean; readonly endpoint: string }
export const APPROVED_PRODUCTION_AI_ENDPOINT = 'https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/formula-review'
const APPROVED_PRODUCTION_ORIGIN = 'https://accordbook.org'
export interface AiReview { readonly summary: string; readonly observations: readonly { detail: string }[]; readonly nextChecks: readonly { detail: string }[] }
export class AiClientError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AiClientError' }
}
export function resolveAiConnection(enabled: unknown, endpoint: unknown, development: boolean, siteOrigin?: string): AiConnection {
  const off = { enabled: false, endpoint: '' }
  if (enabled !== 'true' || typeof endpoint !== 'string') return off
  try {
    const url = new URL(endpoint)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/v1/ai/formula-review') return off
    if (development) {
      if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return off
    } else {
      const currentOrigin = siteOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '')
      if (currentOrigin !== APPROVED_PRODUCTION_ORIGIN || url.href !== APPROVED_PRODUCTION_AI_ENDPOINT) return off
    }
    return { enabled: true, endpoint: url.href }
  } catch { return off }
}
export const aiConnection = resolveAiConnection(import.meta.env.VITE_AI_ENABLED, import.meta.env.VITE_AI_ENDPOINT, import.meta.env.DEV)
export function validAiToken(token: string): boolean { return /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(token) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k))
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const details = (v: unknown, count: number, max: number) => Array.isArray(v) && v.length <= count && v.every(x => object(x) && exact(x, ['detail']) && text(x.detail, max))
const serverErrors: Record<string, number> = {
  UNAUTHORIZED: 401, TOKEN_EXPIRED: 401, TOKEN_REVOKED: 401, INVALID_REQUEST: 400, INVALID_JSON: 400,
  BODY_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, ORIGIN_FORBIDDEN: 403, NOT_FOUND: 404,
  RATE_LIMITED: 429, QUOTA_EXCEEDED: 429, GLOBAL_LIMIT: 429, ALREADY_RUNNING: 409, DUPLICATE_REQUEST: 409,
  SERVICE_UNAVAILABLE: 503, RUNNER_FAILED: 502, RUN_TIMEOUT: 504, INVALID_RESULT: 502, INTERNAL_ERROR: 500,
}
export function parseAiResponse(value: unknown, status: number): AiReview {
  if (!object(value) || typeof value.requestId !== 'string' || !uuid.test(value.requestId)) throw new AiClientError('INVALID_RESPONSE')
  if (status !== 200) {
    if (exact(value, ['requestId', 'error']) && object(value.error) && exact(value.error, ['code', 'retryable']) &&
      typeof value.error.code === 'string' && serverErrors[value.error.code] === status && typeof value.error.retryable === 'boolean') throw new AiClientError(value.error.code)
    throw new AiClientError('INVALID_RESPONSE')
  }
  const r = value.result
  if (!exact(value, ['requestId', 'result']) || !object(r) || !exact(r, ['summary', 'observations', 'nextChecks']) ||
    !text(r.summary, 1200) || !details(r.observations, 8, 800) || !details(r.nextChecks, 5, 500)) throw new AiClientError('INVALID_RESPONSE')
  return r as unknown as AiReview
}
/** Backend operational limits are narrower than the general AI-1A projection. */
export function supportedAiContext(c: AIContextV1): boolean {
  return c.formula.rows.length > 0 && c.formula.rows.length <= 200 &&
    (c.formula.name === undefined || c.formula.name.length <= 120) &&
    (c.formula.notes === undefined || c.formula.notes.length <= 4000) &&
    c.formula.rows.every(r => r.material.length <= 200 && (!r.dilution || r.dilution.solvent.length <= 100)) &&
    Number.isFinite(c.formula.rows.reduce((n, r) => n + r.parts, 0)) && c.formula.rows.some(r => r.parts > 0)
}
const MAX_BYTES = 65536
export async function reviewFormula(input: {
  connection: AiConnection; context: AIContextV1; locale: 'en' | 'ko'; token: string;
  disclosureVersion: number; signal: AbortSignal; idempotencyKey?: string; timeoutMs?: number;
}): Promise<AiReview> {
  // Revalidate the endpoint even if a caller constructs its own connection object.
  const endpoint = resolveAiConnection(input.connection.enabled ? 'true' : '', input.connection.endpoint, true)
  if (!endpoint.enabled) throw new AiClientError('NO_ENDPOINT')
  if (!validAiToken(input.token)) throw new AiClientError('NO_TOKEN')
  if (input.disclosureVersion !== 1) throw new AiClientError('INVALID_DISCLOSURE')
  if (!supportedAiContext(input.context)) throw new AiClientError('UNSUPPORTED_CONTEXT')
  const key = input.idempotencyKey ?? crypto.randomUUID()
  if (!uuid.test(key)) throw new AiClientError('INVALID_REQUEST')
  const body = JSON.stringify({ context: input.context, locale: input.locale, disclosureVersion: 1 })
  if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new AiClientError('BODY_TOO_LARGE')
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  input.signal.addEventListener('abort', abort, { once: true })
  if (input.signal.aborted) abort()
  const timer = setTimeout(() => { timedOut = true; abort() }, input.timeoutMs ?? 35000)
  let rejectAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new AiClientError(timedOut ? 'TIMEOUT' : 'ABORTED'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
    if (controller.signal.aborted) rejectAbort()
  })
  const run = async () => {
    if (controller.signal.aborted) throw new AiClientError('ABORTED')
    const response = await fetch(endpoint.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.token, 'Idempotency-Key': key },
      body, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
    })
    if (!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? '')) throw new AiClientError('INVALID_RESPONSE')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw new AiClientError('RESPONSE_TOO_LARGE')
    if (!response.body) throw new AiClientError('INVALID_RESPONSE')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    const cancelReader = () => { void reader.cancel().catch(() => {}) }
    controller.signal.addEventListener('abort', cancelReader, { once: true })
    try {
      while (true) {
        if (controller.signal.aborted) throw new AiClientError('ABORTED')
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_BYTES) { cancelReader(); throw new AiClientError('RESPONSE_TOO_LARGE') }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let parsed: unknown
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new AiClientError('INVALID_RESPONSE') }
      return parseAiResponse(parsed, response.status)
    } finally { controller.signal.removeEventListener('abort', cancelReader); reader.releaseLock() }
  }
  try { return await Promise.race([cancelled, run()]) }
  catch (error) {
    if (controller.signal.aborted) throw new AiClientError(timedOut ? 'TIMEOUT' : 'ABORTED')
    if (error instanceof AiClientError) throw error
    throw new AiClientError('NETWORK')
  } finally {
    clearTimeout(timer)
    input.signal.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAbort)
    controller.abort()
  }
}
