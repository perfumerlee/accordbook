import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { AiClientError, APPROVED_PRODUCTION_AI_ENDPOINT, parseAiResponse, resolveAiConnection, reviewFormula, supportedAiContext, validAiToken } from '../src/services/aiClient'
import { buildAIContext } from '../src/services/aiContextBuilder'
import { AiRequestGate, aiSnapshotMarker } from '../src/services/aiReviewRequest'
import type { Formula } from '../src/models/formula'

const source: Formula = { id: 'CANARY_ID', formulaId: 'CANARY_DISPLAY', name: 'CANARY_NAME', notes: 'CANARY_NOTES',
  date: '2026-10-05', createdAt: 'CANARY_CREATED', updatedAt: 'CANARY_UPDATED',
  workspaceImport: { sourceFormulaId: 'CANARY_WORKSPACE', importedAt: 'CANARY_IMPORT' },
  rows: [{ id: 'CANARY_ROW', material: 'Benzyl acetate', parts: 100, cas: '140-11-4', dilution: { enabled: true, percent: 10, solvent: 'ALC' } }] }
const build = (options = {}) => { const r = buildAIContext(source, options); if (!r.ok) throw Error('fixture'); return r.context }
const connection = resolveAiConnection('true', 'http://127.0.0.1:8080/v1/ai/formula-review', true)
const token = randomBytes(32).toString('base64url')
const requestId = '08a6fcc1-6bf7-41fa-b394-d9345a72dc1a'
const result = { summary: 'Mock', observations: [{ detail: 'Observation' }], nextChecks: [{ detail: 'Check' }] }
const envelope = () => ({ requestId, result: structuredClone(result) })
const input = () => ({ connection, context: build(), locale: 'en' as const, token, disclosureVersion: 1, signal: new AbortController().signal })
const response = (value: unknown = envelope(), status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('AI connection and request privacy', () => {
  it('allows only the explicit production endpoint on the production site', () => {
    expect(resolveAiConnection('true', APPROVED_PRODUCTION_AI_ENDPOINT, false, 'https://accordbook.org')).toEqual({ enabled: true, endpoint: APPROVED_PRODUCTION_AI_ENDPOINT })
    expect(resolveAiConnection('true', APPROVED_PRODUCTION_AI_ENDPOINT, false, 'https://preview.accordbook.org').enabled).toBe(false)
    expect(resolveAiConnection('true', APPROVED_PRODUCTION_AI_ENDPOINT + '?x=1', false, 'https://accordbook.org').enabled).toBe(false)
    expect(resolveAiConnection('true', 'https://accordbook-ai-api-ssg7tv75ya-du.a.run.app.evil.example/v1/ai/formula-review', false, 'https://accordbook.org').enabled).toBe(false)
  })
  it('does not reject the approved production endpoint during request revalidation', async () => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher)
    vi.stubGlobal('window', { location: { origin: 'https://accordbook.org' } })
    await expect(reviewFormula({ ...input(), connection: { enabled: true, endpoint: APPROVED_PRODUCTION_AI_ENDPOINT } })).resolves.toEqual(result)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([
    [undefined, undefined, true], ['false', connection.endpoint, true], ['true', '', true], ['true', connection.endpoint, false],
    ['true', 'https://external.example/v1/ai/formula-review', true], ['true', connection.endpoint + '?token=secret', true],
    ['true', connection.endpoint + '#secret', true], ['true', 'http://secret@localhost:8080/v1/ai/formula-review', true],
    ['true', 'http://localhost:8080/other', true],
  ])('fails closed (%s)', (flag, endpoint, dev) => expect(resolveAiConnection(flag, endpoint, dev as boolean).enabled).toBe(false))
  it('sends only the exact DTO and private authenticated headers, without mutating source', async () => {
    const before = structuredClone(source)
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher)
    await expect(reviewFormula(input())).resolves.toEqual(result)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(connection.endpoint)
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error' })
    expect(init.headers.Authorization).toBe('Bearer ' + token)
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(JSON.parse(init.body)).toEqual({ context: build(), locale: 'en', disclosureVersion: 1 })
    expect(init.body).not.toContain('CANARY'); expect(init.body).not.toContain(token)
    expect(source).toEqual(before)
  })
  it.each([{ includeName: true }, { includeNotes: true }, { includeName: true, includeNotes: true }])('opts in only selected text %j', async options => {
    const fetcher = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher)
    await reviewFormula({ ...input(), context: build(options) })
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.context.formula.name).toBe(options.includeName ? source.name : undefined)
    expect(body.context.formula.notes).toBe(options.includeNotes ? source.notes : undefined)
    expect(body.context.formula.rows[0].dilution).toEqual({ percent: 10, solvent: 'ALC' })
  })
  it('uses fresh keys for explicit new requests', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response())); vi.stubGlobal('fetch', fetcher)
    await reviewFormula(input()); await reviewFormula(input())
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).not.toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key'])
  })
  it.each([
    { connection: { enabled: false, endpoint: '' } }, { token: '' }, { disclosureVersion: 2 }, { idempotencyKey: 'bad' },
    { context: { ...build(), formula: { rows: [{ material: 'Zero', parts: 0 }] } } },
  ])('rejects before any fetch %j', async changes => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(reviewFormula({ ...input(), ...changes })).rejects.toBeInstanceOf(AiClientError)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires canonical 256-bit tokens', () => {
    expect(validAiToken(token)).toBe(true)
    for (const invalid of ['', token + '=', token.slice(1), 'a'.repeat(43)]) expect(validAiToken(invalid)).toBe(false)
  })
  it('rejects oversized outbound bytes before fetch', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const context = { ...build(), formula: { rows: Array.from({ length: 200 }, () => ({ material: '한'.repeat(200), parts: 1 })) } }
    await expect(reviewFormula({ ...input(), context })).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('checks service limits without changing the builder', () => {
    expect(supportedAiContext(build())).toBe(true)
    expect(supportedAiContext({ ...build(), formula: { rows: [{ material: 'X', parts: 0 }] } })).toBe(false)
    expect(supportedAiContext({ ...build(), formula: { rows: build().formula.rows, name: 'x'.repeat(121) } })).toBe(false)
  })
})
describe('strict responses and bounded transport', () => {
  it('accepts the agreed text-only shape', () => expect(parseAiResponse(envelope(), 200)).toEqual(result))
  it.each([
    null, [], {}, { ...envelope(), extra: 'secret' }, { ...envelope(), requestId: 'bad' },
    { requestId, result: { ...result, extra: true } }, { requestId, result: { ...result, summary: '' } },
    { requestId, result: { ...result, summary: 'x'.repeat(1201) } }, { requestId, result: { ...result, observations: [{}] } },
    { requestId, result: { ...result, observations: [{ detail: 'x', extra: 1 }] } },
    { requestId, result: { ...result, observations: Array(9).fill({ detail: 'x' }) } },
    { requestId, result: { ...result, observations: [{ detail: 'x'.repeat(801) }] } },
    { requestId, result: { ...result, nextChecks: Array(6).fill({ detail: 'x' }) } },
    { requestId, result: { ...result, nextChecks: [{ detail: 'x'.repeat(501) }] } },
    { requestId, result: { ...result, nextChecks: 'wrong' } },
  ])('rejects malformed output %#', value => expect(() => parseAiResponse(value, 200)).toThrow('INVALID_RESPONSE'))
  it.each([
    ['UNAUTHORIZED', 401], ['TOKEN_EXPIRED', 401], ['TOKEN_REVOKED', 401], ['DUPLICATE_REQUEST', 409],
    ['ALREADY_RUNNING', 409], ['RATE_LIMITED', 429], ['QUOTA_EXCEEDED', 429], ['GLOBAL_LIMIT', 429],
    ['SERVICE_UNAVAILABLE', 503], ['INVALID_RESULT', 502], ['RUN_TIMEOUT', 504], ['INTERNAL_ERROR', 500],
  ])('surfaces only %s without retry', async (code, status) => {
    const fetcher = vi.fn().mockResolvedValue(response({ requestId, error: { code, retryable: false } }, status as number)); vi.stubGlobal('fetch', fetcher)
    await expect(reviewFormula(input())).rejects.toMatchObject({ code })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('rejects unknown error content without including it in exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ requestId, error: { code: token, retryable: false } }, 500)))
    await expect(reviewFormula(input())).rejects.toMatchObject({ message: 'INVALID_RESPONSE' })
  })
  it.each(['{bad', 'x'.repeat(65537)])('rejects invalid JSON or excessive stream', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } })))
    await expect(reviewFormula(input())).rejects.toMatchObject({ code: body.length > 65536 ? 'RESPONSE_TOO_LARGE' : 'INVALID_RESPONSE' })
  })
  it('rejects oversized content-length', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '65537' } })))
    await expect(reviewFormula(input())).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })
  it('sanitizes offline failures with no retry', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error(token)); vi.stubGlobal('fetch', fetcher)
    await expect(reviewFormula(input())).rejects.toMatchObject({ code: 'NETWORK', message: 'NETWORK' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('aborts even if a transport ignores the signal', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const controller = new AbortController()
    const promise = reviewFormula({ ...input(), signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' })
  })
  it('never transmits an already-aborted request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController(); controller.abort()
    await expect(reviewFormula({ ...input(), signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('times out without retry while waiting for response body', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    const promise = expect(reviewFormula({ ...input(), timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(21); await promise
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
describe('snapshot ownership and isolation', () => {
  it('invalidates switched, edited, closed and replaced operations, including late responses', () => {
    const gate = new AiRequestGate()
    const marker = aiSnapshotMarker(source, false, false)
    const first = gate.begin(source.id, marker)
    expect(gate.isCurrent(first, source.id, marker)).toBe(true)
    expect(gate.isCurrent(first, 'another', marker)).toBe(false)
    expect(gate.isCurrent(first, source.id, marker + 'edit')).toBe(false)
    const second = gate.begin(source.id, marker)
    expect(first.controller.signal.aborted).toBe(true)
    expect(gate.isCurrent(first, source.id, marker)).toBe(false)
    gate.invalidate()
    expect(second.controller.signal.aborted).toBe(true)
    expect(gate.isCurrent(second, source.id, marker)).toBe(false)
  })
  it('tracks current editing and optional selections, not provenance writes', () => {
    const marker = aiSnapshotMarker(source, false, false)
    expect(aiSnapshotMarker({ ...source, updatedAt: 'new' }, false, false)).toBe(marker)
    expect(aiSnapshotMarker({ ...source, notes: 'new' }, false, false)).not.toBe(marker)
    expect(aiSnapshotMarker(source, true, false)).not.toBe(marker)
  })
  it('has no Core writes, persistence, analytics, logging, or HTML rendering in AI UI/client', () => {
    for (const path of ['src/components/AiFormulaReview.tsx', 'src/services/aiClient.ts', 'src/services/aiReviewRequest.ts']) {
      const code = readFileSync(path, 'utf8')
      expect(code).not.toMatch(/console\.|localStorage|indexedDB|dangerouslySetInnerHTML|flushProvenance|saveFormula|createVersion|createExperiment|importWorkspace|services\/analytics|storageService/)
    }
  })
})
