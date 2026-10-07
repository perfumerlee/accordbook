import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { readFileSync } from 'node:fs'
import { buildAIContext } from '../src/services/aiContextBuilder'
import { makeFormulaAiReviewRecord, persistFormulaAiReview } from '../src/services/aiReviewPersistence'
import { createStorage } from '../src/storage/storageService'
import type { Formula } from '../src/models/formula'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const formula: Formula = {
  id: 'formula-source', formulaId: 'ACC-TEST-001', date: '2026-10-07', name: 'Optional Name', notes: 'Optional Notes',
  createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z',
  rows: [{ id: 'row-1', material: 'Hedione', parts: 100, cas: '24851-98-7' }],
}
const response = { summary: 'Summary', observations: [{ detail: 'Observation' }], nextChecks: [{ detail: 'Check' }] }
const draft = (includeOptional = false) => {
  const result = buildAIContext(formula, { includeName: includeOptional, includeNotes: includeOptional })
  if (!result.ok) throw new Error(result.error.code)
  return makeFormulaAiReviewRecord({
    reviewId: 'a1b2c3d4-e5f6-4789-8abc-def012345678', sourceFormulaId: formula.id,
    sourceFormulaDisplayId: formula.formulaId, snapshot: result.context, response,
    locale: 'en', createdAt: '2026-10-07T01:00:00.000Z',
  })
}

describe('Formula AI Review persistence integration', () => {
  it('keeps persistence behind the explicit Save Review action and never runs another provider request', () => {
    const component = readFileSync('src/components/AiFormulaReview.tsx', 'utf8')
    const saveHandler = component.slice(component.indexOf('const saveReview ='), component.indexOf('const built = formula ?'))
    expect(component).toContain('snapshot: built.context')
    expect(component).toContain('locale: executionLocale')
    expect(component).toContain('context: submittedReview.snapshot, locale: submittedReview.locale')
    expect(component).toContain('setReviewDraft({ ...submittedReview, response: value })')
    expect(component).toContain('onClick={() => void saveReview()}')
    expect(saveHandler).toContain('persistFormulaAiReview')
    expect(saveHandler).not.toMatch(/reviewFormula|\bfetch\s*\(/)
  })

  it('pairs the exact submitted context, response, source, and execution locale without rebuilding Formula data', () => {
    const submitted = buildAIContext(formula, { includeName: false, includeNotes: false })
    if (!submitted.ok) throw new Error(submitted.error.code)
    const executionLocale: 'en' | 'ko' = 'en'
    const record = makeFormulaAiReviewRecord({
      reviewId: 'a1b2c3d4-e5f6-4789-8abc-def012345678', sourceFormulaId: formula.id,
      sourceFormulaDisplayId: formula.formulaId, snapshot: submitted.context, response,
      locale: executionLocale, createdAt: '2026-10-07T01:00:00.000Z',
    })
    expect(record.snapshot).toBe(submitted.context)
    expect(record.snapshot.formula).not.toHaveProperty('name')
    expect(record.snapshot.formula).not.toHaveProperty('notes')
    expect(record.sourceFormulaId).toBe(formula.id)
    expect(record.locale).toBe('en')
    expect(record.response).toBe(response)
    formula.rows[0].material = 'Edited after response'
    expect(record.snapshot.formula.rows[0].material).toBe('Hedione')
    formula.rows[0].material = 'Hedione'
  })

  it('saves only on explicit persistence call and handles memory fallback as session-only', async () => {
    const storage = await createStorage(), record = draft()
    expect(await persistFormulaAiReview(storage.reviews, record, 'memory')).toBe('session-only')
    expect((await storage.reviews.get(record.reviewId))?.snapshot).toEqual(record.snapshot)
  })

  it('does not create another record on a repeated save with the same Review ID', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), record = draft()
    const save = vi.spyOn(storage.reviews, 'save')
    expect(await persistFormulaAiReview(storage.reviews, record, 'indexeddb')).toBe('saved-locally')
    expect(await persistFormulaAiReview(storage.reviews, record, 'indexeddb')).toBe('saved-locally')
    expect(save).toHaveBeenCalledOnce()
    expect(await storage.reviews.listAll()).toHaveLength(1)
  })

  it('confirms an uncertain write by reading back the same ID rather than issuing a second add', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), record = draft()
    const originalSave = storage.reviews.save.bind(storage.reviews)
    const save = vi.spyOn(storage.reviews, 'save')
    save.mockImplementation(async value => { await originalSave(value); throw new Error('write acknowledgement uncertain') })
    expect(await persistFormulaAiReview(storage.reviews, record, 'indexeddb')).toBe('saved-locally')
    expect(save).toHaveBeenCalledOnce()
    expect(await storage.reviews.listAll()).toHaveLength(1)
  })

  it('keeps a successful response available and returns failed when neither write nor readback can confirm it', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), record = draft()
    vi.spyOn(storage.reviews, 'save').mockRejectedValue(new Error('storage unavailable'))
    expect(record.response.summary).toBe('Summary')
    expect(await persistFormulaAiReview(storage.reviews, record, 'indexeddb')).toBe('failed')
    expect(await storage.reviews.get(record.reviewId)).toBeUndefined()
  })

  it('retains explicitly selected Name and Notes in the exact submitted snapshot only', () => {
    const record = draft(true)
    expect(record.snapshot.formula.name).toBe('Optional Name')
    expect(record.snapshot.formula.notes).toBe('Optional Notes')
  })
})
