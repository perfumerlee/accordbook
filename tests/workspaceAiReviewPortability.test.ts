import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import type { ExperimentAiCompareReviewRecord } from '../src/models/experimentAiReviewRecord'
import type { ExperimentNextRoundReviewRecord } from '../src/models/experimentNextRoundAi'
import type { FormulaAiReviewRecord } from '../src/models/aiReviewRecord'
import type { Experiment } from '../src/models/experiment'
import { createStorage } from '../src/storage/storageService'
import { collectWorkspace } from '../src/services/workspaceCollector'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { importWorkspace } from '../src/services/workspaceImporter'
import { validateWorkspaceFile } from '../src/services/workspaceValidation'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import { workspaceFixture, stamp } from './workspaceFixtures'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
const compareRecord = (experimentId: string, variantId: string, reviewId = '2f6a7f2c-8084-4d9a-9c6f-5b03a3958174'): ExperimentAiCompareReviewRecord => {
  const submittedContext: ExperimentAiCompareReviewRecord['submittedContext'] = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_compare', locale: 'ko',
    base: { label: 'BASE', totalParts: 1000, rows: [{ material: 'Submitted Rose', parts: 1000 }] },
    variants: [{ label: 'V1', totalParts: 1000, rows: [{ material: 'Submitted Rose', parts: 1000 }] }],
    deltas: [{ variantLabel: 'V1', baseTotalParts: 1000, variantTotalParts: 1000, totalDeltaParts: 0, changes: [] }],
  }
  return { reviewId, reviewType: 'experiment', operation: 'compare', schemaVersion: 1, experimentId, experimentDisplayName: 'Saved Experiment', selectedVariantIds: [variantId], selectedVariantLabels: ['A'], variantIdsByLabel: { V1: variantId }, submittedContext, deterministicDelta: submittedContext.deltas,
    response: { summary: 'Saved Compare response', variants: [{ variantLabel: 'V1', hypothesis: 'Saved hypothesis', uncertainties: [], smellingChecks: [] }], overallUncertainties: [], overallSmellingChecks: [] }, locale: 'ko', createdAt: stamp }
}
const nextRoundRecord = (experimentId: string, variantId: string, evaluationId: string, reviewId = '3f6a7f2c-8084-4d9a-9c6f-5b03a3958174'): ExperimentNextRoundReviewRecord => {
  const fact = { material: 'Submitted Rose', parts: 1000 }
  const submittedContext: ExperimentNextRoundReviewRecord['submittedContext'] = {
    type: 'accordbook-ai-context', version: 1, scope: 'experiment_next_round', locale: 'en', disclosureVersion: 1,
    base: { totalParts: 1000, rows: [fact] }, evaluated: { totalParts: 1000, rows: [fact] },
    delta: { baseTotalParts: 1000, evaluatedTotalParts: 1000, totalDeltaParts: 0, changes: [{ kind: 'unchanged', identityStatus: 'row-lineage', deltaParts: 0, changedFields: [], uncertaintyCodes: [], before: fact, after: fact }] },
    evaluation: { observation: 'Submitted observation', verdict: 'continue', nextAction: 'Submitted next action' },
  }
  return { reviewId, reviewType: 'experiment', operation: 'next_round', schemaVersion: 1, experimentId, experimentDisplayName: 'Saved Experiment', variantId, variantLabel: 'A', evaluationId,
    submittedContext, deterministicDelta: submittedContext.delta, response: { findings: 'Saved Next Round response', uncertainties: [], nextChecks: [], adjustmentDirections: [], advisoryOnly: true }, locale: 'en', createdAt: stamp }
}
const formulaRecord = (sourceFormulaId: string, reviewId = '5f6a7f2c-8084-4d9a-9c6f-5b03a3958174'): FormulaAiReviewRecord => ({
  reviewId, reviewType: 'formula', sourceFormulaId, sourceFormulaDisplayId: 'ACC-2610-001',
  snapshot: { type: 'accordbook-ai-context', version: 1, scope: 'formula_review', formula: { name: 'Submitted Formula', rows: [{ material: 'Submitted Rose', parts: 1000 }] } },
  response: { summary: 'Saved Formula response', observations: [{ detail: 'Saved observation' }], nextChecks: [{ detail: 'Saved next check' }] },
  locale: 'ko', createdAt: stamp, schemaVersion: 1,
})
function cloneExperimentWithFreshIds(value: Experiment): Experiment {
  const variants = new Map(value.variants.map(variant => [variant.variantId, `second-${variant.variantId}`]))
  const evaluations = new Map(value.variants.map(variant => [variant.variantId, new Map((variant.evaluations ?? []).map(item => [item.evaluationId, `second-${item.evaluationId}`]))]))
  return { ...structuredClone(value), experimentId: 'second-experiment', variants: value.variants.map(variant => ({ ...variant,
    variantId: variants.get(variant.variantId)!, parentVariantId: variant.parentVariantId ? variants.get(variant.parentVariantId)! : null,
    evaluations: variant.evaluations?.map(item => ({ ...item, evaluationId: evaluations.get(variant.variantId)!.get(item.evaluationId)! })),
    ...(variant.sourceEvaluationId ? { sourceEvaluationId: evaluations.get(variant.parentVariantId!)!.get(variant.sourceEvaluationId)! } : {}),
    ...(variant.origin ? { origin: { ...variant.origin, evaluationId: evaluations.get(variant.parentVariantId!)!.get(variant.origin.evaluationId)! } } : {}),
  })) }
}
async function sourceWithReviews(mode: 'memory' | 'indexeddb' = 'memory') {
  vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined)
  const storage = await createStorage(), source = await workspaceFixture()
  await storage.workspaces.appendWorkspaceAtomic(source)
  const e = source.experiments[0], v = e.variants[0], evaluation = v.evaluations![0]
  const compare = compareRecord(e.experimentId, v.variantId)
  const next = nextRoundRecord(e.experimentId, v.variantId, evaluation.evaluationId)
  await storage.reviews.save(compare); await storage.reviews.save(next)
  return { storage, source, compare, next }
}
describe('Experiment AI Review workspace portability', () => {
  it.each(['memory', 'indexeddb'] as const)('round-trips both review types with remapped references (%s)', async mode => {
    const { storage, source, compare, next } = await sourceWithReviews(mode)
    const collected = await collectWorkspace(storage, source.formula.id)
    expect(collected.ok).toBe(true)
    if (!collected.ok) return
    const file = parseWorkspaceFile(collected.serialized)
    expect(file.formatVersion).toBe(2)
    expect(file.reviews).toEqual([compare, next])
    vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined)
    const importedStorage = await createStorage()
    const result = await importWorkspace(importedStorage, file, { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const imported = (await importedStorage.workspaces.readWorkspace(result.formulaId))!
    const [compareCopy, nextCopy] = imported.reviews!
    expect(compareCopy).toMatchObject({ ...compare, experimentId: imported.experiments[0].experimentId, selectedVariantIds: [imported.experiments[0].variants[0].variantId], variantIdsByLabel: { V1: imported.experiments[0].variants[0].variantId } })
    expect(compareCopy.submittedContext).toEqual(compare.submittedContext)
    expect(compareCopy.response).toEqual(compare.response)
    expect(nextCopy).toMatchObject({ ...next, experimentId: imported.experiments[0].experimentId, variantId: imported.experiments[0].variants[0].variantId, evaluationId: imported.experiments[0].variants[0].evaluations![0].evaluationId })
    expect(nextCopy.submittedContext).toEqual(next.submittedContext)
    expect(nextCopy.response).toEqual(next.response)
    expect(file.reviews).toEqual([compare, next])
  })
  it.each(['compare', 'next_round'] as const)('imports a workspace containing only %s reviews', async operation => {
    const { storage, source, compare, next } = await sourceWithReviews()
    const collected = await collectWorkspace(storage, source.formula.id)
    if (!collected.ok) throw new Error('workspace collection failed')
    const file = parseWorkspaceFile(collected.serialized)
    file.reviews = [operation === 'compare' ? compare : next]
    const destination = await createStorage()
    const result = await importWorkspace(destination, file, { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const imported = (await destination.workspaces.readWorkspace(result.formulaId))!
    expect(imported.reviews).toHaveLength(1)
    expect(imported.reviews![0].operation).toBe(operation)
  })
  it('imports a version 2 workspace with an empty Review collection', async () => {
    const source = await workspaceFixture(), storage = await createStorage()
    await storage.workspaces.appendWorkspaceAtomic(source)
    const collected = await collectWorkspace(storage, source.formula.id)
    if (!collected.ok) throw new Error('workspace collection failed')
    const file = parseWorkspaceFile(collected.serialized)
    expect(file.reviews).toEqual([])
    const destination = await createStorage()
    const result = await importWorkspace(destination, file, { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    if (result.ok) expect((await destination.workspaces.readWorkspace(result.formulaId))?.reviews).toEqual([])
  })
  it('exports only saved reviews belonging to included Experiments', async () => {
    const { storage, source, compare } = await sourceWithReviews()
    await storage.reviews.save(compareRecord('outside-workspace', 'outside-variant', '4f6a7f2c-8084-4d9a-9c6f-5b03a3958174'))
    const result = await collectWorkspace(storage, source.formula.id)
    expect(result.ok && result.workspace.reviews).toEqual([compare, expect.objectContaining({ operation: 'next_round' })])
    expect(JSON.stringify(result)).not.toContain('outside-workspace')
    expect(JSON.stringify(result)).not.toMatch(/token|authorization|secret/i)
  })
  it('exports Reviews for each included Experiment and remaps both Experiment graphs', async () => {
    const source = await workspaceFixture(), storage = await createStorage()
    const second = cloneExperimentWithFreshIds(source.experiments[0])
    await storage.workspaces.appendWorkspaceAtomic(source)
    await storage.experiments.save(second)
    await storage.reviews.save(compareRecord(source.experiments[0].experimentId, source.experiments[0].variants[0].variantId))
    await storage.reviews.save(compareRecord(second.experimentId, second.variants[0].variantId, '4f6a7f2c-8084-4d9a-9c6f-5b03a3958174'))
    const collected = await collectWorkspace(storage, source.formula.id)
    expect(collected.ok && collected.workspace.reviews).toHaveLength(2)
    if (!collected.ok) return
    const destination = await createStorage()
    const result = await importWorkspace(destination, parseWorkspaceFile(collected.serialized), { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const imported = (await destination.workspaces.readWorkspace(result.formulaId))!
    expect(imported.experiments).toHaveLength(2)
    expect(imported.reviews).toHaveLength(2)
    const importedExperimentIds = new Set(imported.experiments.map(experiment => experiment.experimentId))
    expect(imported.reviews!.every(review => importedExperimentIds.has(review.experimentId))).toBe(true)
  })
  it('supports legacy v1 and rejects malformed, mismatched and dangling Review references', async () => {
    const source = await workspaceFixture()
    const { reviews: _reviews, ...legacy } = toWorkspaceFile(source, stamp)
    const base = { ...legacy, formatVersion: 1 as const }
    expect(validateWorkspaceFile(base).reviews).toBeUndefined()
    const variant = source.experiments[0].variants[0]
    const review = compareRecord(source.experiments[0].experimentId, variant.variantId)
    const v2 = { ...base, formatVersion: 2, reviews: [review] }
    expect(validateWorkspaceFile(v2).reviews).toHaveLength(1)
    expect(() => validateWorkspaceFile({ ...v2, reviews: [{ ...review, reviewType: 'formula' }] })).toThrow('invalid AI Review record')
    expect(() => validateWorkspaceFile({ ...v2, reviews: [{ ...review, unexpected: true }] })).toThrow('invalid AI Review record')
    expect(() => validateWorkspaceFile({ ...v2, reviews: [compareRecord('missing-experiment', variant.variantId)] })).toThrow('missing Experiment owner')
    const formulaReview = formulaRecord(source.formula.id)
    expect(validateWorkspaceFile({ ...v2, reviews: [formulaReview] }).reviews).toEqual([formulaReview])
    expect(() => validateWorkspaceFile({ ...v2, reviews: [{ ...formulaReview, response: { raw: 'not validated' } }] })).toThrow('invalid AI Review record')
    expect(() => validateWorkspaceFile({ ...v2, reviews: [formulaRecord('another-formula')] })).toThrow('wrong Formula owner')
    expect(() => validateWorkspaceFile({ ...v2, reviews: [{ ...review, reviewType: 'unknown' }] })).toThrow('invalid AI Review record')
  })
  it.each(['memory', 'indexeddb'] as const)('exports and round-trips only the Formula Review for this Formula (%s)', async mode => {
    const { storage, source, compare, next } = await sourceWithReviews(mode)
    const formulaReview = formulaRecord(source.formula.id)
    await storage.reviews.save(formulaReview)
    await storage.reviews.save(formulaRecord('unrelated-formula', '6f6a7f2c-8084-4d9a-9c6f-5b03a3958174'))
    const collected = await collectWorkspace(storage, source.formula.id)
    expect(collected.ok).toBe(true)
    if (!collected.ok) return
    const file = parseWorkspaceFile(collected.serialized)
    expect(file.formatVersion).toBe(2)
    expect(file.reviews).toHaveLength(3)
    expect(file.reviews).toContainEqual(formulaReview)
    expect(file.reviews).toContainEqual(compare)
    expect(file.reviews).toContainEqual(next)
    expect(file.reviews).not.toContainEqual(expect.objectContaining({ sourceFormulaId: 'unrelated-formula' }))
    if (mode === 'indexeddb') vi.stubGlobal('indexedDB', new IDBFactory())
    const destination = await createStorage()
    const result = await importWorkspace(destination, file, { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const imported = (await destination.workspaces.readWorkspace(result.formulaId))!
    const formulaCopy = imported.reviews!.find(review => review.reviewType === 'formula')!
    expect(formulaCopy.sourceFormulaId).toBe(imported.formula.id)
    expect(formulaCopy).toMatchObject({ ...formulaReview, sourceFormulaId: imported.formula.id })
    expect(formulaCopy.snapshot).toEqual(formulaReview.snapshot)
    expect(formulaCopy.response).toEqual(formulaReview.response)
    expect(formulaCopy.locale).toBe(formulaReview.locale)
    expect(formulaCopy.createdAt).toBe(formulaReview.createdAt)
  })
  it('keeps Formula and Experiment AI Reviews in the existing Notebook Backup v5 round trip', async () => {
    const { storage, source, compare, next } = await sourceWithReviews()
    const formulaReview = formulaRecord(source.formula.id)
    await storage.reviews.save(formulaReview)
    const backup = await createBackup(storage)
    expect(backup.formatVersion).toBe(5)
    expect(backup.data.reviews).toEqual(expect.arrayContaining([formulaReview, compare, next]))

    const restored = await createStorage()
    await importBackup(restored, parseBackup(JSON.stringify(backup)))
    expect((await restored.exportData()).reviews).toEqual(expect.arrayContaining([formulaReview, compare, next]))
  })
  it('remaps a Formula Review source ID and preserves its snapshot when its Review ID collides', async () => {
    const { storage, source } = await sourceWithReviews('indexeddb')
    const formulaReview = formulaRecord(source.formula.id)
    await storage.reviews.save(formulaReview)
    const collection = await collectWorkspace(storage, source.formula.id)
    if (!collection.ok) throw new Error('workspace collection failed')
    vi.stubGlobal('indexedDB', new IDBFactory())
    const destination = await createStorage()
    const localReview = formulaRecord('keep-local-formula', formulaReview.reviewId)
    await destination.reviews.save(localReview)
    const result = await importWorkspace(destination, parseWorkspaceFile(collection.serialized), { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    expect(await destination.reviews.get(localReview.reviewId)).toMatchObject(localReview)
    if (!result.ok) return
    const imported = (await destination.workspaces.readWorkspace(result.formulaId))!
    const copied = imported.reviews!.find(review => review.reviewType === 'formula')!
    expect(copied.reviewId).not.toBe(formulaReview.reviewId)
    expect(copied.sourceFormulaId).toBe(imported.formula.id)
    expect(copied.snapshot).toEqual(formulaReview.snapshot)
    expect(copied.response).toEqual(formulaReview.response)
    expect(copied.locale).toBe(formulaReview.locale)
    expect(copied.createdAt).toBe(formulaReview.createdAt)
  })
  it('rejects a dangling Formula Review before any Workspace records are written', async () => {
    const { storage, source } = await sourceWithReviews()
    const formulaReview = formulaRecord(source.formula.id)
    await storage.reviews.save(formulaReview)
    const collected = await collectWorkspace(storage, source.formula.id)
    if (!collected.ok) throw new Error('workspace collection failed')
    const file = parseWorkspaceFile(collected.serialized)
    file.reviews = [formulaRecord('wrong-formula')]
    const destination = await createStorage()
    const result = await importWorkspace(destination, file, { now: new Date(stamp) })
    expect(result).toEqual({ ok: false, code: 'invalid-workspace' })
    const after = await destination.exportData()
    expect(after.formulas).toEqual([])
    expect(after.versions).toEqual([])
    expect(after.experiments).toEqual([])
    expect(after.reviews).toEqual([])
  })
  it('remaps a colliding Review ID without replacing the existing local record', async () => {
    const { storage, source, compare } = await sourceWithReviews('indexeddb')
    const collection = await collectWorkspace(storage, source.formula.id)
    if (!collection.ok) throw new Error('workspace collection failed')
    vi.stubGlobal('indexedDB', new IDBFactory())
    const destination = await createStorage()
    const localFormulaReview = formulaRecord('local-existing-formula', compare.reviewId)
    await destination.reviews.save(localFormulaReview)
    const result = await importWorkspace(destination, parseWorkspaceFile(collection.serialized), { now: new Date(stamp) })
    expect(result.ok).toBe(true)
    expect(await destination.reviews.get(compare.reviewId)).toMatchObject(localFormulaReview)
    if (!result.ok) return
    const imported = (await destination.workspaces.readWorkspace(result.formulaId))!
    const copied = imported.reviews!.find(review => review.reviewType === 'experiment' && review.operation === 'compare')!
    expect(copied.reviewId).not.toBe(compare.reviewId)
    expect(copied.submittedContext).toEqual(compare.submittedContext)
  })
  it('preserves colliding local Reviews and rolls back all writes if Review persistence fails', async () => {
    const { storage, source, compare } = await sourceWithReviews('indexeddb')
    const collection = await collectWorkspace(storage, source.formula.id)
    if (!collection.ok) throw new Error('workspace collection failed')
    vi.stubGlobal('indexedDB', new IDBFactory())
    const destination = await createStorage()
    await destination.reviews.save({ ...compare, experimentId: 'local-existing-experiment', experimentDisplayName: 'Keep this unrelated review' })
    const originalAdd = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'reviews') throw new DOMException('Injected Review write failure', 'QuotaExceededError')
      return originalAdd.apply(this, args)
    })
    const failed = await importWorkspace(destination, parseWorkspaceFile(collection.serialized), { now: new Date(stamp) })
    expect(failed).toEqual({ ok: false, code: 'atomic-commit-failed' })
    expect(await destination.reviews.getExperimentReview(compare.reviewId)).toMatchObject({ experimentDisplayName: 'Keep this unrelated review' })
    const afterFailedImport = await destination.exportData()
    expect(afterFailedImport.formulas).toHaveLength(0)
    expect(afterFailedImport.versions).toHaveLength(0)
    expect(afterFailedImport.experiments).toHaveLength(0)
  })
})
