import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { FormulaAiReviewRecord } from '../src/models/aiReviewRecord'
import { createMemoryStorage, openDatabase } from '../src/storage/database'
import { AiReviewRepository } from '../src/storage/aiReviewRepository'
import { createStorage } from '../src/storage/storageService'
import { archiveFormula, deleteArchivedFormula } from '../src/services/formulaLifecycle'
import { importBackup, parseBackup } from '../src/services/importJson'
import { createBackup } from '../src/services/exportJson'
import { toPaidFormulaContent } from '../src/services/paidFormulaPackage'
import type { Formula } from '../src/models/formula'

afterEach(() => { vi.unstubAllGlobals() })

const formula: Formula = {
  id: 'formula-1', formulaId: 'ACC-TEST-001', date: '2026-10-07', name: 'Private name', notes: 'Private notes',
  createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z',
  rows: [{ id: 'row-1', material: 'Hedione', parts: 100, cas: '24851-98-7' }],
}
const review = (overrides: Partial<FormulaAiReviewRecord> = {}): FormulaAiReviewRecord => ({
  reviewId: '2f6a7f2c-8084-4d9a-9c6f-5b03a3958174', reviewType: 'formula', sourceFormulaId: formula.id,
  sourceFormulaDisplayId: formula.formulaId,
  snapshot: { type: 'accordbook-ai-context', version: 1, scope: 'formula_review', formula: { rows: [{ material: 'Hedione', parts: 100, cas: '24851-98-7' }] } },
  response: { summary: 'Advisory', observations: [{ detail: 'Observation' }], nextChecks: [{ detail: 'Check' }] },
  locale: 'en', createdAt: '2026-10-07T01:00:00.000Z', schemaVersion: 1, ...overrides,
})

describe('Formula AI Review storage', () => {
  it('upgrades an existing v4 database without rewriting existing stores and adds the source index', async () => {
    const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory)
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('accordbook', 4)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of ['formulas', 'archive', 'versions', 'settings', 'meta', 'experiments']) db.createObjectStore(name)
        request.transaction!.objectStore('versions').createIndex('parentFormulaId', 'parentFormulaId')
        request.transaction!.objectStore('experiments').createIndex('parentFormulaId', 'parentFormulaId')
        request.transaction!.objectStore('formulas').put(formula, formula.id)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    legacy.close()
    const database = await openDatabase()
    expect(database.mode).toBe('indexeddb')
    expect((await database.get('formulas', formula.id))?.formulaId).toBe(formula.formulaId)
    const inspect = factory.open('accordbook', 5)
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => { inspect.onsuccess = () => resolve(inspect.result); inspect.onerror = () => reject(inspect.error) })
    expect(upgraded.objectStoreNames.contains('reviews')).toBe(true)
    expect(upgraded.transaction('reviews').objectStore('reviews').indexNames.contains('sourceFormulaId')).toBe(true)
    upgraded.close()
  })

  it('saves durably and supports get, formula list, all list, and delete with isolated immutable snapshots', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), record = review()
    expect(storage.mode).toBe('indexeddb')
    expect(await storage.reviews.save(record)).toBe('saved-locally')
    expect((await (await createStorage()).reviews.get(record.reviewId))?.response.summary).toBe('Advisory')
    ;(record.snapshot.formula.rows[0] as { material: string }).material = 'Mutated caller value'
    const loaded = await storage.reviews.get(record.reviewId)
    expect(loaded?.snapshot.formula.rows[0].material).toBe('Hedione')
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded?.snapshot.formula.rows)).toBe(true)
    expect((await storage.reviews.listByFormula(formula.id)).map(item => item.reviewId)).toEqual([record.reviewId])
    expect((await storage.reviews.listAll()).map(item => item.reviewId)).toEqual([record.reviewId])
    await storage.reviews.delete(record.reviewId)
    expect(await storage.reviews.get(record.reviewId)).toBeUndefined()
  })

  it('rejects duplicate IDs and corrupt records and never persists credential fields', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const repository = new AiReviewRepository(await openDatabase())
    await repository.save(review())
    await expect(repository.save(review())).rejects.toThrow()
    await expect(repository.save(review({ reviewId: 'bad-id' }))).rejects.toThrow('Invalid Formula AI Review')
    await expect(repository.save({ ...review(), token: 'must-not-persist' } as FormulaAiReviewRecord)).rejects.toThrow('Invalid Formula AI Review')
    await expect(repository.save(review({ reviewId: '2f6a7f2c-8084-4d9a-9c6f-5b03a3958175', snapshot: { ...review().snapshot, formula: { ...review().snapshot.formula, name: undefined } } }))).rejects.toThrow('Invalid Formula AI Review')
    const saved = await repository.get(review().reviewId)
    expect(saved?.snapshot.formula).not.toHaveProperty('notes')
  })

  it('keeps reviews after Formula deletion so they remain accessible as orphans', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const storage = await createStorage(), repository = storage.reviews
    await storage.formulas.save(formula); await archiveFormula(storage, formula); await repository.save(review())
    await deleteArchivedFormula(storage, formula.id)
    expect(await storage.archive.get(formula.id)).toBeUndefined()
    expect((await repository.listAll())[0].sourceFormulaId).toBe(formula.id)
  })

  it('preserves legacy-import reviews and round-trips reviews in full backup v4, including orphan links', async () => {
    const storage = await createStorage()
    const record = review({ sourceFormulaId: 'deleted-formula' })
    await storage.reviews.save(record)
    const legacy = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 3, data: { settings: {}, formulas: [], archive: [], versions: [], experiments: [], meta: {} } }))
    expect(legacy.formatVersion).toBe(4)
    expect(legacy.data.reviews).toBeUndefined()
    await importBackup(storage, legacy)
    expect((await storage.reviews.get(record.reviewId))?.sourceFormulaId).toBe('deleted-formula')
    const full = await createBackup(storage)
    expect(full.formatVersion).toBe(4)
    const restored = parseBackup(JSON.stringify(full))
    expect(restored.data.reviews).toEqual([record])
    await importBackup(storage, restored)
    expect((await storage.reviews.listAll())[0].sourceFormulaId).toBe('deleted-formula')
  })

  it('rejects malformed and duplicate review records in v4 backups', () => {
    const data = { settings: {}, formulas: [], archive: [], versions: [], experiments: [], reviews: [review()], meta: {} }
    expect(parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 4, data })).data.reviews).toHaveLength(1)
    expect(() => parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 4, data: { ...data, reviews: [review(), review()] } }))).toThrow('Duplicate AI Review id')
    expect(() => parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 4, data: { ...data, reviews: [{ ...review(), response: { raw: 'invalid' } }] } }))).toThrow('Invalid AI Review data')
  })

  it('reports session-only storage and keeps licensed formula content separate from review history', async () => {
    const repository = new AiReviewRepository(createMemoryStorage())
    expect(await repository.save(review())).toBe('session-only')
    const content = toPaidFormulaContent(formula)
    expect(content).not.toHaveProperty('reviews')
    expect(JSON.stringify(content)).not.toContain('Advisory')
  })

  it('falls back to session-only reporting when a version upgrade is blocked by another open tab', async () => {
    const factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory)
    const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('accordbook', 4)
      request.onupgradeneeded = () => { for (const name of ['formulas', 'archive', 'versions', 'settings', 'meta', 'experiments']) request.result.createObjectStore(name) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const storage = await createStorage()
    expect(storage.mode).toBe('memory')
    expect(await storage.reviews.save(review())).toBe('session-only')
    blocker.close()
  })
})
