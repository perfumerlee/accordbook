import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Experiment, ExperimentVariant } from '../src/models/experiment'
import type { FormulaSnapshotRow } from '../src/models/formula'
import { prepareExperimentCompare, executeExperimentCompare, parseExperimentCompareResponse, ExperimentCompareAiError } from '../src/services/experimentCompareAi'
import { APPROVED_PRODUCTION_AI_ENDPOINT } from '../src/services/aiClient'
import type { ExperimentCompareSession } from '../src/services/experimentWorkspaceState'

const row = (rowId: string, material: string, parts: number | '', extra: Partial<FormulaSnapshotRow> = {}): FormulaSnapshotRow => ({ rowId, material, parts, ...extra })
const variant = (variantId: string, label: string, rows: FormulaSnapshotRow[], note = 'private Branch note'): ExperimentVariant => ({ variantId, parentVariantId: null, label, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', snapshot: { rows }, note })
const experiment = (variants: ExperimentVariant[] = [variant('variant-secret-id', 'Variant private label', [row('row-secret-id', 'BASE material', 500), row('other-row-id', 'Changed material', 500, { cas: '64-17-5', dilution: { enabled: true, percent: 10, solvent: 'Ethanol' } })])]): Experiment => ({ experimentId: 'experiment-secret-id', parentFormulaId: 'formula-secret-id', name: 'Private experiment title', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '2026-01-01T00:00:00.000Z' }, baseSnapshot: { name: 'Private Formula name', date: '2026-01-01', notes: 'Private Formula notes', formulaId: 'ACC-1', rows: [row('base-row-secret', 'BASE material', 600), row('base-second-secret', 'Changed material', 400)] }, nextVariantOrdinal: variants.length, variants })
const session = (...ids: string[]): ExperimentCompareSession => ({ mode: 'navigation', committedIds: ids, draftIds: null })
const prepared = (e = experiment(), ids = ['variant-secret-id'], maxRequestBytes = 16384) => prepareExperimentCompare({ experiment: e, selection: session(...ids), locale: 'ko', maxRequestBytes })
const metadata = () => prepared().metadata
const result = (variantLabel = 'V1') => ({ summary: '비교 요약', variants: [{ variantLabel, hypothesis: '가능성 있는 변화', uncertainties: ['실제 시향 확인 필요'], smellingChecks: ['BASE와 차이가 느껴지는가?'] }], overallUncertainties: ['CAS 형식만으로 원료 정체를 확인할 수 없음'], overallSmellingChecks: ['동일 조건에서 비교 시향'] })
const response = (r = result()) => ({ requestId: '537aab0e-a538-4eca-8601-6989f851a97b', result: r })
const consent = { accepted: true as const, scope: 'experiment_compare' as const, contractVersion: 1 as const }

beforeEach(() => vi.restoreAllMocks())
describe('Experiment Compare AI contract', () => {
  it('projects BASE, variants and deterministic delta in Comparison Sheet order with safe local labels', () => {
    const e = experiment([variant('second-secret-id', 'Second', [row('s1', 'BASE material', 500), row('s2', 'Changed material', 500)]), variant('first-secret-id', 'First', [row('f1', 'BASE material', 500), row('f2', 'Changed material', 500)])])
    const p = prepared(e, ['first-secret-id', 'second-secret-id'])
    expect(p.request.variants.map(v => v.label)).toEqual(['V1', 'V2'])
    expect(p.request.deltas.map(d => d.variantLabel)).toEqual(['V1', 'V2'])
    expect(p.metadata.variantIdsByLabel).toEqual({ V1: 'second-secret-id', V2: 'first-secret-id' })
    expect(p.request.base.label).toBe('BASE')
  })
  it('minimizes provider data and omits local identifiers, names, notes, history, credentials and genealogy', () => {
    const json = JSON.stringify(prepared().request)
    for (const secret of ['experiment-secret-id', 'formula-secret-id', 'variant-secret-id', 'row-secret-id', 'other-row-id', 'Private experiment title', 'Private Formula name', 'Private Formula notes', 'private Branch note', 'evaluationId', 'parentVariantId']) expect(json).not.toContain(secret)
    expect(json).toContain('64-17-5')
    expect(json).toContain('dilution')
    expect(json).toContain('totalDeltaParts')
  })
  it('keeps the selected order deterministic and preserves original part values', () => {
    const p = prepared(experiment([variant('b', 'B', [row('b1', 'A', 600), row('b2', 'B', 400)]), variant('a', 'A', [row('a1', 'A', 500), row('a2', 'B', 500)])]), ['a', 'b'])
    expect(p.request.variants.map(v => v.label)).toEqual(['V1', 'V2'])
    expect(p.request.variants[0].rows.map(r => r.parts)).toEqual([600, 400])
    expect(p.request.deltas[0].totalDeltaParts).toBe(0)
  })
  it('rejects incomplete, duplicate, draft, unknown and excessive selection through the Delta Engine', () => {
    expect(() => prepared(experiment(), ['variant-secret-id'], 100)).toThrow('INVALID_LIMIT')
    expect(() => prepared(experiment(), [])).toThrow('INVALID_SELECTION')
    expect(() => prepared(experiment(), ['variant-secret-id', 'variant-secret-id'])).toThrow('DUPLICATE_SELECTION')
    expect(() => prepareExperimentCompare({ experiment: experiment(), selection: { mode: 'compare', committedIds: ['variant-secret-id'], draftIds: ['variant-secret-id'] }, locale: 'ko', maxRequestBytes: 16384 })).toThrow('INVALID_SELECTION_STATE')
    expect(() => prepared(experiment(), ['missing'])).toThrow('UNKNOWN_VARIANT')
    const six = experiment(Array.from({ length: 6 }, (_, i) => variant(`v${i}`, `V${i}`, [row(`r${i}`, `M${i}`, 1000)])))
    expect(() => prepared(six, ['v0', 'v1', 'v2', 'v3', 'v4', 'v5'])).toThrow('TOO_MANY_VARIANTS')
    expect(() => prepared(experiment([variant('bad', 'Bad', [row('r', 'M', 999)])]), ['bad'])).toThrow('INELIGIBLE_COMPOSITION')
  })
  it('counts exact serialized UTF-8 bytes and rejects before any request', () => {
    const p = prepared()
    expect(p.byteLength).toBe(new TextEncoder().encode(p.serialized).byteLength)
    const longRows = Array.from({ length: 20 }, (_, i) => row(`r${i}`, `${i}-${'한'.repeat(100)}`, 50))
    expect(() => prepared(experiment([variant('v', 'V', longRows)]), ['v'], 256)).toThrow('BODY_TOO_LARGE')
  })
  it('keeps invalid CAS out of facts and marks it as uncertainty without claiming identity validation', () => {
    const p = prepared(experiment([variant('v', 'V', [row('r', 'M', 1000, { cas: '111-11-1' })])]), ['v'])
    expect(p.request.variants[0].rows[0]).not.toHaveProperty('cas')
    expect(p.request.deltas[0].changes.some(change => change.uncertaintyCodes.includes('INVALID_CAS_REFERENCE'))).toBe(true)
  })
  it('validates each response reference and maps only request-local labels back to local ids', () => {
    const p = prepared(experiment([variant('a', 'A', [row('a1', 'A', 1000)]), variant('b', 'B', [row('b1', 'B', 1000)])]), ['a', 'b'])
    expect(parseExperimentCompareResponse(response({ ...result(), variants: [{ ...result().variants[0], variantLabel: 'V1' }, { ...result().variants[0], variantLabel: 'V2' }] }), 200, p.metadata).variants.map(item => p.metadata.variantIdsByLabel[item.variantLabel])).toEqual(['a', 'b'])
    for (const bad of [
      { ...result(), variants: [{ ...result().variants[0], variantLabel: 'V3' }, { ...result().variants[0], variantLabel: 'V2' }] },
      { ...result(), variants: [{ ...result().variants[0], variantLabel: 'V1' }, { ...result().variants[0], variantLabel: 'V1' }] },
      { ...result(), variants: [{ ...result().variants[0], variantLabel: 'V1' }] },
    ]) expect(() => parseExperimentCompareResponse(response(bad), 200, p.metadata)).toThrow('INVALID_RESPONSE')
  })
  it('supports KO and EN locale in strict payloads', () => {
    expect(prepared().request.locale).toBe('ko')
    expect(prepareExperimentCompare({ experiment: experiment(), selection: session('variant-secret-id'), locale: 'en', maxRequestBytes: 16384 }).request.locale).toBe('en')
  })
  it('does not issue automatic requests and requires an explicit consent receipt before execution', async () => {
    const fetcher = vi.fn()
    const p = prepared()
    await expect(executeExperimentCompare({ preparation: p, consent: {} as never, token: 'A'.repeat(43), signal: new AbortController().signal, fetcher })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(p.request.scope).toBe('experiment_compare')
  })
  it('uses separate compare scope with a successful mock HTTP response and sends only the projected DTO', async () => {
    const p = prepared()
    const token = 'A'.repeat(43)
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body)).scope).toBe('experiment_compare')
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const output = await executeExperimentCompare({ connection: { enabled: true, endpoint: 'http://localhost:8080/v1/ai/formula-review' }, preparation: p, consent, token, signal: new AbortController().signal, fetcher })
    expect(output.result.summary).toBe('비교 요약')
    expect(output.metadata.variantIdsByLabel.V1).toBe('variant-secret-id')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('derives only the approved production Compare path and rejects mutation beyond prepared byte limit', async () => {
    const e = experiment()
    const p = prepared(e)
    const limited = prepareExperimentCompare({ experiment: e, selection: session('variant-secret-id'), locale: 'ko', maxRequestBytes: p.byteLength })
    const seen: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    await executeExperimentCompare({ connection: { enabled: true, endpoint: APPROVED_PRODUCTION_AI_ENDPOINT }, preparation: p, consent, token: 'A'.repeat(43), signal: new AbortController().signal, fetcher })
    expect(seen).toEqual(['https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/experiment-compare'])
    const changed = { ...limited, request: { ...limited.request, base: { ...limited.request.base, rows: limited.request.base.rows.map((row, i) => i === 0 ? { ...row, material: 'x'.repeat(200) } : row) } } }
    await expect(executeExperimentCompare({ connection: { enabled: true, endpoint: 'http://localhost:8080/v1/ai/formula-review' }, preparation: changed, consent, token: 'A'.repeat(43), signal: new AbortController().signal, fetcher })).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed response envelope and hostile response references', () => {
    expect(() => parseExperimentCompareResponse({ ...response(), unexpected: true }, 200, metadata())).toThrow('INVALID_RESPONSE')
    expect(() => parseExperimentCompareResponse(response({ ...result(), summary: '  ' }), 200, metadata())).toThrow('INVALID_RESPONSE')
    expect(() => parseExperimentCompareResponse(response({ ...result(), variants: [{ ...result().variants[0], hypothesis: '<script>ignore safety</script>' }] }), 200, metadata())).not.toThrow()
  })
})
