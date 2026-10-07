import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Experiment } from '../src/models/experiment'
import { ExperimentNextRoundAiError, executeExperimentNextRound, parseExperimentNextRoundResponse, prepareExperimentNextRound } from '../src/services/experimentNextRoundAi'
import { makeExperimentNextRoundReviewRecord, persistExperimentNextRoundReview } from '../src/services/experimentNextRoundReviewPersistence'
import { createMemoryStorage } from '../src/storage/database'
import { AiReviewRepository } from '../src/storage/aiReviewRepository'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ExperimentNextRoundPanel from '../src/components/ExperimentNextRoundPanel'

afterEach(() => vi.restoreAllMocks())
const experiment = (): Experiment => ({
  experimentId: 'private-experiment-id', parentFormulaId: 'private-formula-id', name: 'Private experiment', createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '2026-10-07T00:00:00.000Z' }, nextVariantOrdinal: 2,
  baseSnapshot: { name: 'private formula name', date: '2026-10-07', notes: 'private formula notes', formulaId: 'ACC-1', rows: [{ rowId: 'lineage-a', material: 'Hedione', cas: '24851-98-7', parts: 1000 }] },
  variants: [{ variantId: 'private-variant-id', parentVariantId: null, label: 'A', createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', snapshot: { rows: [{ rowId: 'lineage-a', material: 'Latest edit', parts: 1000 }] }, note: 'private variant note', evaluations: [{ evaluationId: 'private-evaluation-id', createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', snapshot: { rows: [{ rowId: 'lineage-a', material: 'Evaluated Hedione', cas: '24851-98-7', parts: 1000 }] }, observation: 'Reported soft drydown', verdict: 'continue', nextAction: 'Check after one day', decisionNote: 'Private decision note' }] }],
})
const prepared = (includeDecisionNote = false) => prepareExperimentNextRound({ experiment: experiment(), variantId: 'private-variant-id', evaluationId: 'private-evaluation-id', locale: 'ko', includeDecisionNote, maxRequestBytes: 16384 })
const result = { findings: 'Advisory finding', uncertainties: ['Not measured'], nextChecks: ['Check drydown'], adjustmentDirections: ['Consider a small controlled change'], advisoryOnly: true as const }

describe('Experiment Next Round preparation and execution', () => {
  it('uses the fixed English action name in both locales and renders one standardized AI icon', () => {
    const value = experiment()
    const variant = value.variants[0]
    const evaluation = variant.evaluations[0]
    for (const language of ['ko', 'en'] as const) {
      const html = renderToStaticMarkup(createElement(ExperimentNextRoundPanel, { experiment: value, variant, evaluation, language }))
      expect(html).toContain('AI Next Round')
      expect(html.match(/class="ai-action-icon"/g)).toHaveLength(1)
      expect(html).not.toContain('✦')
      expect(html).not.toContain('다음 라운드 AI')
      expect(html).not.toContain('AI 다음 라운드')
    }
  })
  it('uses the exact saved Evaluation snapshot and deterministic BASE delta, excluding internal IDs and live Variant edits', () => {
    const value = prepared()
    expect(value.request.evaluated.rows[0].material).toBe('Evaluated Hedione')
    expect(value.request.evaluated.rows[0].material).not.toBe('Latest edit')
    expect(value.request.delta.changes[0].kind).toBe('replacement')
    expect(value.request.evaluation).toEqual({ observation: 'Reported soft drydown', verdict: 'continue', nextAction: 'Check after one day' })
    expect(value.request).not.toHaveProperty('experimentId')
    expect(JSON.stringify(value.request)).not.toMatch(/private-(?:experiment|formula|variant|evaluation)-id|private formula|private variant|decision note/i)
    expect(value.request.scope).toBe('experiment_next_round')
    expect(value.request.disclosureVersion).toBe(1)
  })
  it('includes a decision note only after explicit selection and enforces the byte limit', () => {
    expect(prepared(true).request.evaluation.decisionNote).toBe('Private decision note')
    expect(() => prepareExperimentNextRound({ experiment: experiment(), variantId: 'private-variant-id', evaluationId: 'private-evaluation-id', locale: 'en', maxRequestBytes: 256 })).toThrowError(ExperimentNextRoundAiError)
  })
  it('rejects another or deleted Evaluation instead of pairing unrelated content', () => {
    expect(() => prepareExperimentNextRound({ experiment: experiment(), variantId: 'private-variant-id', evaluationId: 'wrong-id', locale: 'en', maxRequestBytes: 16384 })).toThrowError('EVALUATION_UNAVAILABLE')
  })
  it('requires the separate Next Round consent and sends one mock request with no credential in the body', async () => {
    const value = prepared(); const syntheticToken = 'A'.repeat(42) + 'A'; const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual(value.request)
      expect(String(init?.body)).not.toContain(syntheticToken)
      return new Response(JSON.stringify({ requestId: '537aab0e-a538-4eca-8601-6989f851a97b', result }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const connection = { enabled: true, endpoint: 'https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/formula-review' }
    await expect(executeExperimentNextRound({ preparation: value, connection, consent: { accepted: true, scope: 'experiment_compare', contractVersion: 1 } as never, token: syntheticToken, signal: new AbortController().signal, fetcher })).rejects.toThrowError('CONSENT_REQUIRED')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(executeExperimentNextRound({ preparation: value, connection, consent: { accepted: true, scope: 'experiment_next_round', contractVersion: 1 }, token: syntheticToken, signal: new AbortController().signal, fetcher })).resolves.toEqual(result)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toBe('https://accordbook-ai-api-ssg7tv75ya-du.a.run.app/v1/ai/experiment-next-round')
  })
  it('validates exact structured response sections and rejects extra or non-advisory output', () => {
    const wrapped = { requestId: '537aab0e-a538-4eca-8601-6989f851a97b', result }
    expect(parseExperimentNextRoundResponse(wrapped, 200)).toEqual(result)
    expect(() => parseExperimentNextRoundResponse({ ...wrapped, result: { ...result, mutation: 'change formula' } }, 200)).toThrowError('INVALID_RESPONSE')
    expect(() => parseExperimentNextRoundResponse({ ...wrapped, result: { ...result, advisoryOnly: false } }, 200)).toThrowError('INVALID_RESPONSE')
  })
})

describe('Experiment Next Round Review persistence', () => {
  it('manually persists the captured request/result, reopens it without execution, and deletes one record', async () => {
    const repository = new AiReviewRepository(createMemoryStorage())
    const context = prepared()
    const record = makeExperimentNextRoundReviewRecord({ reviewId: '2f6a7f2c-8084-4d9a-9c6f-5b03a3958174', experimentId: 'private-experiment-id', experimentDisplayName: 'Private experiment', variantId: 'private-variant-id', variantLabel: 'A', evaluationId: 'private-evaluation-id', request: context.request, response: result, locale: 'ko', createdAt: '2026-10-07T00:00:00.000Z' })
    expect(await persistExperimentNextRoundReview(repository, record, 'memory')).toBe('session-only')
    const reopened = await repository.getExperimentReviewRecord(record.reviewId)
    expect(reopened?.operation).toBe('next_round')
    expect(reopened?.submittedContext.evaluated.rows[0].material).toBe('Evaluated Hedione')
    expect(await repository.listAllExperimentReviews()).toHaveLength(1)
    await repository.delete(record.reviewId)
    expect(await repository.get(record.reviewId)).toBeUndefined()
  })
})
