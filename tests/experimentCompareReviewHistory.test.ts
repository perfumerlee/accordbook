import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { ExperimentAiCompareReviewRecord } from '../src/models/experimentAiReviewRecord'
import { createStorage } from '../src/storage/storageService'
import { createMemoryStorage } from '../src/storage/database'
import { AiReviewRepository } from '../src/storage/aiReviewRepository'
import { makeExperimentCompareReviewRecord, persistExperimentCompareReview } from '../src/services/experimentCompareReviewPersistence'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import type { ExperimentNextRoundReviewRecord } from '../src/models/experimentNextRoundAi'

afterEach(() => vi.unstubAllGlobals())

const record = (): ExperimentAiCompareReviewRecord => {
  const submittedContext: ExperimentAiCompareReviewRecord['submittedContext'] = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_compare', locale: 'ko',
    base: { label: 'BASE', totalParts: 1000, rows: [{ material: 'Hedione', parts: 1000 }] },
    variants: [{ label: 'V1', totalParts: 1000, rows: [{ material: 'Hedione', parts: 1000 }] }],
    deltas: [{ variantLabel: 'V1', baseTotalParts: 1000, variantTotalParts: 1000, totalDeltaParts: 0, changes: [] }],
  }
  return {
    reviewId: '2f6a7f2c-8084-4d9a-9c6f-5b03a3958174', reviewType: 'experiment', operation: 'compare', schemaVersion: 1,
    experimentId: 'experiment-id', experimentDisplayName: 'Experiment saved name', selectedVariantIds: ['variant-id'], selectedVariantLabels: ['A'], variantIdsByLabel: { V1: 'variant-id' },
    submittedContext, deterministicDelta: submittedContext.deltas,
    response: { summary: 'Advisory', variants: [{ variantLabel: 'V1', hypothesis: 'Hypothesis', uncertainties: [], smellingChecks: [] }], overallUncertainties: [], overallSmellingChecks: [] },
    locale: 'ko', createdAt: '2026-10-07T00:00:00.000Z',
  }
}
const nextRoundRecord = (): ExperimentNextRoundReviewRecord => {
  const fact = { material: 'Hedione', parts: 1000 }
  const submittedContext: ExperimentNextRoundReviewRecord['submittedContext'] = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_next_round', locale: 'ko', disclosureVersion: 1,
    base: { totalParts: 1000, rows: [fact] }, evaluated: { totalParts: 1000, rows: [fact] },
    delta: { baseTotalParts: 1000, evaluatedTotalParts: 1000, totalDeltaParts: 0, changes: [{ kind: 'unchanged', identityStatus: 'heuristic-match', deltaParts: 0, changedFields: [], uncertaintyCodes: [], before: fact, after: fact }] },
    evaluation: { observation: 'Observation', verdict: 'continue', nextAction: 'Check again' },
  }
  return { reviewId: '3f6a7f2c-8084-4d9a-9c6f-5b03a3958174', reviewType: 'experiment', operation: 'next_round', schemaVersion: 1,
    experimentId: 'experiment-id', experimentDisplayName: 'Experiment saved name', variantId: 'variant-id', variantLabel: 'A', evaluationId: 'evaluation-id',
    submittedContext, deterministicDelta: submittedContext.delta, response: { findings: 'Advisory', uncertainties: [], nextChecks: [], adjustmentDirections: [], advisoryOnly: true }, locale: 'ko', createdAt: '2026-10-07T00:00:00.000Z' }
}

describe('Experiment Compare Review History', () => {
  it('saves only the captured submitted context and isolates Experiment history from Formula history', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), saved = record()
    expect(await storage.reviews.save(saved)).toBe('saved-locally')
    expect((await storage.reviews.listByExperiment('experiment-id')).map(item => item.reviewId)).toEqual([saved.reviewId])
    expect(await storage.reviews.listAll()).toEqual([])
    const loaded = await storage.reviews.getExperimentReview(saved.reviewId)
    expect(loaded?.submittedContext.base.rows[0].material).toBe('Hedione')
    expect(Object.isFrozen(loaded?.submittedContext.base.rows)).toBe(true)
    expect(JSON.stringify(loaded)).not.toMatch(/token|authorization|PRIVATE VARIANT NOTE/i)
  })

  it('validates records and reports memory fallback as session-only', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), completed = {
      reviewId: record().reviewId, experimentId: 'experiment-id', experimentDisplayName: 'Saved Experiment', selectedVariantIds: ['variant-id'],
      variantIdsByLabel: { V1: 'variant-id' }, selectedVariantLabels: ['A'], request: record().submittedContext, response: record().response, locale: 'ko' as const, createdAt: record().createdAt,
    }
    const made = makeExperimentCompareReviewRecord(completed)
    expect(made.deterministicDelta).toEqual(completed.request.deltas)
    expect(await persistExperimentCompareReview(storage.reviews, made, 'indexeddb')).toBe('saved-locally')
    await expect(storage.reviews.save({ ...record(), response: { raw: 'unvalidated' } } as unknown as ExperimentAiCompareReviewRecord)).rejects.toThrow('Invalid Experiment AI Review')
    const memory = new AiReviewRepository(createMemoryStorage())
    expect(await persistExperimentCompareReview(memory, { ...made, reviewId: '3f6a7f2c-8084-4d9a-9c6f-5b03a3958174' }, 'memory')).toBe('session-only')
  })

  it('includes Compare and Next Round records in v5 backups and preserves both on legacy v4 import', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), compare = record(), nextRound = nextRoundRecord()
    await storage.reviews.save(compare); await storage.reviews.save(nextRound)
    const full = await createBackup(storage)
    expect(full.formatVersion).toBe(5)
    expect(full.data.reviews).toHaveLength(2)
    await importBackup(storage, parseBackup(JSON.stringify(full)))
    expect((await storage.reviews.listAllExperimentReviews()).map(item => item.reviewId).sort()).toEqual([compare.reviewId, nextRound.reviewId].sort())
    expect((await storage.reviews.listAllExperiments()).map(item => item.reviewId)).toEqual([compare.reviewId])

    const v4 = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 4, data: { settings: {}, formulas: [], archive: [], versions: [], experiments: [], reviews: [], meta: {} } }))
    await importBackup(storage, v4)
    expect((await storage.reviews.listAllExperimentReviews()).map(item => item.reviewId).sort()).toEqual([compare.reviewId, nextRound.reviewId].sort())
  })

  it('preserves local Experiment reviews for legacy v1-v3 imports and rejects cross-version records', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), experimentReview = record()
    await storage.reviews.save(experimentReview)
    const legacy = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 3, data: { settings: {}, formulas: [], archive: [], versions: [], experiments: [], meta: {} } }))
    await importBackup(storage, legacy)
    expect((await storage.reviews.listAllExperiments()).map(item => item.reviewId)).toEqual([experimentReview.reviewId])
    const v4WithExperiment = { app: 'Accordbook', formatVersion: 4, data: { settings: {}, formulas: [], archive: [], versions: [], experiments: [], reviews: [experimentReview], meta: {} } }
    expect(() => parseBackup(JSON.stringify(v4WithExperiment))).toThrow('Invalid AI Review data')
  })
})
