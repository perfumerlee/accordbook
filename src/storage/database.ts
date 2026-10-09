import type { MaterialPaletteRecord } from '../models/materialPalette'
import { mergePaletteRecords, validatePaletteRecords } from '../services/materialPalette'
import type { Formula, FormulaVersion } from '../models/formula'
import type { Experiment } from '../models/experiment'
import type { AiReviewRecord, FormulaAiReviewRecord } from '../models/aiReviewRecord'
import type { ExperimentAiReviewRecord } from '../models/aiReviewRecord'
import type { AccordbookSettings } from '../models/settings'
import { appendIndexedWorkspace, readIndexedWorkspace, prepareWorkspaceAppend, allocateWorkspaceReviews, WorkspaceAppendConflict, type WorkspaceAppend, type WorkspaceRecords } from './workspaceRepository'

export type StoreName = 'formulas' | 'archive' | 'versions' | 'settings' | 'meta' | 'experiments' | 'reviews' | 'palette'
export type StorageMode = 'indexeddb' | 'memory'

type StoreValue = MaterialPaletteRecord | Formula | FormulaVersion | Experiment | AiReviewRecord | AccordbookSettings | number
type StoreMap = Map<string, StoreValue>
const sourceFormulaId = (value: StoreValue): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  if ('parentFormulaId' in value) return value.parentFormulaId
  if ('sourceFormulaId' in value) return value.sourceFormulaId
  return undefined
}

const DB_NAME = 'accordbook'
const DB_VERSION = 7
const STORE_NAMES: StoreName[] = ['formulas', 'archive', 'versions', 'settings', 'meta', 'experiments', 'reviews', 'palette']

export interface StorageDatabase {
  writePaletteAtomic(records: MaterialPaletteRecord[], mode: 'add' | 'add-formula' | 'update' | 'replace'): Promise<void>
  readonly mode: StorageMode
  readWorkspace(formulaId: string): Promise<WorkspaceRecords | undefined>
  appendWorkspaceAtomic(input: WorkspaceAppend): Promise<void>
  get<T extends StoreValue>(store: StoreName, key: string): Promise<T | undefined>
  getAll<T extends StoreValue>(store: StoreName): Promise<T[]>
  /** Returns owned copies, including in memory mode. */
  getByParent<T extends FormulaVersion | Experiment | AiReviewRecord>(store: 'versions' | 'experiments' | 'reviews', parentFormulaId: string): Promise<T[]>
  getReviewsByExperiment(experimentId: string): Promise<ExperimentAiReviewRecord[]>
  getParentReferences(store: 'versions' | 'experiments'): Promise<{ key: string; parentFormulaId: string }[]>
  entries(store: StoreName): Promise<Array<[string, StoreValue]>>
  put(store: StoreName, key: string, value: StoreValue): Promise<void>
  add(store: StoreName, key: string, value: StoreValue): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
  clear(): Promise<void>
  replaceAll(data: { palette?: MaterialPaletteRecord[]; formulas: Formula[]; archive: Formula[]; versions?: FormulaVersion[]; experiments?: Experiment[]; reviews?: AiReviewRecord[]; settings?: AccordbookSettings; meta: Record<string, number> }, options?: { preserveExperimentReviews?: boolean }): Promise<void>
}

function createMemoryDatabase(): StorageDatabase {
  let stores = new Map<StoreName, StoreMap>(STORE_NAMES.map((name) => [name, new Map()]))
  return {
    mode: 'memory',
    async writePaletteAtomic(records, mode) { const result = mergePaletteRecords([...stores.get('palette')!.values()] as MaterialPaletteRecord[], records, mode); stores.set('palette', new Map(result.map(item => [item.materialId, structuredClone(item)]))) },
    async readWorkspace(formulaId) {
      const formula = stores.get('formulas')!.get(formulaId) as Formula | undefined
      if (!formula) return undefined
      const experiments = [...stores.get('experiments')!.values()].filter(e => (e as Experiment).parentFormulaId === formulaId) as Experiment[]
      const experimentIds = new Set(experiments.map(e => e.experimentId))
      return structuredClone({ formula,
        versions: [...stores.get('versions')!.values()].filter(v => (v as FormulaVersion).parentFormulaId === formulaId) as FormulaVersion[],
        experiments, reviews: [...stores.get('reviews')!.values()].filter((r): r is AiReviewRecord => typeof r === 'object' && r !== null && 'reviewType' in r && (r.reviewType === 'formula' ? r.sourceFormulaId === formulaId : r.reviewType === 'experiment' && experimentIds.has(r.experimentId))) })
    },
    async appendWorkspaceAtomic(input) {
      const value = prepareWorkspaceAppend(input)
      const staged = new Map(stores)
      for (const name of ['formulas', 'versions', 'experiments', 'reviews', 'meta'] as const) staged.set(name, new Map(stores.get(name)!))
      if (stores.get('archive')!.has(value.formula.id)) throw new Error('Formula identity already exists in Archive')
      if (value.checkDisplayId && ['formulas', 'archive'].some(name => [...stores.get(name as StoreName)!.values()].some(record => (record as Formula).formulaId === value.formula.formulaId))) throw new WorkspaceAppendConflict('display-id-collision')
      const add = (store: StoreName, key: string, record: StoreValue) => {
        if (staged.get(store)!.has(key)) throw new Error('Workspace identity collision')
        staged.get(store)!.set(key, record)
      }
      add('formulas', value.formula.id, value.formula)
      for (const version of value.versions) add('versions', version.versionId, version)
      for (const experiment of value.experiments) add('experiments', experiment.experimentId, experiment)
      for (const review of allocateWorkspaceReviews(value.reviews ?? [], new Set(staged.get('reviews')!.keys()))) add('reviews', review.reviewId, review)
      if (value.metaUpdate) {
        const { key, value: sequence, expectedValue } = value.metaUpdate
        if ((staged.get('meta')!.get(key) ?? null) !== expectedValue) throw new WorkspaceAppendConflict('meta-changed')
        staged.get('meta')!.set(key, sequence)
      }
      stores = staged
    },
    async get<T extends StoreValue>(store: StoreName, key: string) { return stores.get(store)!.get(key) as T | undefined },
    async getAll<T extends StoreValue>(store: StoreName) { return [...stores.get(store)!.values()] as T[] },
    async getByParent<T extends FormulaVersion | Experiment | AiReviewRecord>(store: 'versions' | 'experiments' | 'reviews', parentFormulaId: string) { return structuredClone([...stores.get(store)!.values()].filter(v => sourceFormulaId(v) === parentFormulaId)) as T[] },
    async getReviewsByExperiment(experimentId) { return structuredClone([...stores.get('reviews')!.values()].filter((value): value is ExperimentAiReviewRecord => typeof value === 'object' && value !== null && 'reviewType' in value && (value as ExperimentAiReviewRecord).reviewType === 'experiment' && (value as ExperimentAiReviewRecord).experimentId === experimentId)) },
    async getParentReferences(store) { return [...stores.get(store)!.entries()].map(([key, value]) => ({ key, parentFormulaId: (value as FormulaVersion | Experiment).parentFormulaId })) },
    async entries(store: StoreName) { return [...stores.get(store)!.entries()] },
    async put(store: StoreName, key: string, value: StoreValue) { stores.get(store)!.set(key, value) },
    async add(store: StoreName, key: string, value: StoreValue) { const target = stores.get(store)!; if (target.has(key)) throw new Error('Record identity already exists'); target.set(key, structuredClone(value)) },
    async delete(store: StoreName, key: string) { stores.get(store)!.delete(key) },
    async clear() { stores.forEach((store) => store.clear()) },
    async replaceAll(data, options = {}) {
      const palette = data.palette === undefined ? undefined : validatePaletteRecords(data.palette)
      const staged = new Map<StoreName, StoreMap>(STORE_NAMES.map(name => [name, new Map(stores.get(name)!)]))
      const existingExperimentReviews = options.preserveExperimentReviews ? [...stores.get('reviews')!.values()].filter((value): value is ExperimentAiReviewRecord => typeof value === 'object' && value !== null && 'reviewType' in value && (value as ExperimentAiReviewRecord).reviewType === 'experiment') : []
      const importedReviews = [...(data.reviews ?? []), ...existingExperimentReviews]
      if (new Set(importedReviews.map(item => item.reviewId)).size !== importedReviews.length) throw new Error('Duplicate review ID during backup import')
      for (const name of STORE_NAMES) if ((name !== 'palette' || palette !== undefined) && (name !== 'reviews' || data.reviews !== undefined || options.preserveExperimentReviews)) staged.get(name)!.clear()
      for (const item of data.formulas) staged.get('formulas')!.set(item.id, item)
      for (const item of data.archive) staged.get('archive')!.set(item.id, item)
      for (const item of data.versions ?? []) staged.get('versions')!.set(item.versionId, item)
      for (const item of data.experiments ?? []) staged.get('experiments')!.set(item.experimentId, item)
      for (const item of importedReviews) staged.get('reviews')!.set(item.reviewId, item)
      if (data.settings) staged.get('settings')!.set('current', data.settings)
      for (const [key, value] of Object.entries(data.meta)) staged.get('meta')!.set(key, value)
      for (const item of palette ?? []) staged.get('palette')!.set(item.materialId, structuredClone(item))
      stores = staged
    },
  }
}

function createIndexedDbDatabase(database: IDBDatabase): StorageDatabase {
  const run = async <T>(store: StoreName, operation: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const transaction = database.transaction(store, 'readwrite')
    return new Promise<T>((resolve, reject) => {
      let value: T
      let failure: unknown
      transaction.oncomplete = () => resolve(value)
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('IndexedDB transaction aborted'))
      transaction.onerror = event => { failure ??= (event.target as IDBRequest)?.error ?? transaction.error }
      try { operation(transaction.objectStore(store)).onsuccess = event => { value = (event.target as IDBRequest<T>).result } }
      catch (error) { failure = error; transaction.abort() }
    })
  }
  return {
    mode: 'indexeddb',
    async writePaletteAtomic(records, mode) {
      const incoming = validatePaletteRecords(records)
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('palette', 'readwrite'), store = tx.objectStore('palette')
        let failure: unknown
        tx.oncomplete = () => resolve()
        tx.onerror = event => { failure ??= (event.target as IDBRequest)?.error ?? tx.error }
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('Palette transaction aborted'))
        store.getAll().onsuccess = event => {
          try { const result = mergePaletteRecords((event.target as IDBRequest<MaterialPaletteRecord[]>).result, incoming, mode); if (mode === 'replace') store.clear(); for (const item of mode === 'replace' ? result : incoming) store.put(item, item.materialId) }
          catch (error) { failure = error; tx.abort() }
        }
      })
    },
    readWorkspace(formulaId) { return readIndexedWorkspace(database, formulaId) },
    async appendWorkspaceAtomic(input) { await appendIndexedWorkspace(database, input) },
    async get<T extends StoreValue>(store: StoreName, key: string) { return run(store, (objectStore) => objectStore.get(key)) as Promise<T | undefined> },
    async getAll<T extends StoreValue>(store: StoreName) { return run(store, (objectStore) => objectStore.getAll()) as Promise<T[]> },
    async getByParent<T extends FormulaVersion | Experiment | AiReviewRecord>(store: 'versions' | 'experiments' | 'reviews', parentFormulaId: string) {
      return new Promise<T[]>((resolve, reject) => {
        const tx = database.transaction(store, 'readonly'), objectStore = tx.objectStore(store)
        const indexName = store === 'reviews' ? 'sourceFormulaId' : 'parentFormulaId'
        const indexed = objectStore.indexNames.contains(indexName)
        const request = indexed ? objectStore.index(indexName).getAll(parentFormulaId) : objectStore.getAll()
        let result: T[] = []
        request.onsuccess = () => { result = indexed ? request.result : request.result.filter((v: T) => sourceFormulaId(v) === parentFormulaId) }
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(tx.error ?? new Error('Scoped query aborted'))
      })
    },
    async getReviewsByExperiment(experimentId) {
      return new Promise<ExperimentAiReviewRecord[]>((resolve, reject) => {
        const tx = database.transaction('reviews', 'readonly'), store = tx.objectStore('reviews')
        const request = store.indexNames.contains('experimentId') ? store.index('experimentId').getAll(experimentId) : store.getAll()
        let result: ExperimentAiReviewRecord[] = []
        request.onsuccess = () => { result = (request.result as AiReviewRecord[]).filter((value): value is ExperimentAiReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'experiment' && value.experimentId === experimentId) }
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(tx.error ?? new Error('Experiment review query aborted'))
      })
    },
    async getParentReferences(store) {
      return new Promise<{ key: string; parentFormulaId: string }[]>((resolve, reject) => {
        const tx = database.transaction(store, 'readonly'), objectStore = tx.objectStore(store)
        const indexed = objectStore.indexNames.contains('parentFormulaId')
        const parentIndex = indexed ? objectStore.index('parentFormulaId') : undefined
        const request = parentIndex ? parentIndex.openKeyCursor(undefined, 'nextunique') : objectStore.openCursor()
        const result: { key: string; parentFormulaId: string }[] = []
        const seen = new Set<IDBValidKey>()
        let keys: IDBValidKey[] | undefined, cursorFinished = false, pendingGroups = 0
        const readUnindexed = () => {
          if (!keys || !cursorFinished || pendingGroups) return
          // Corrupt legacy rows without an indexable parent must still reach orphan reconciliation.
          for (const key of keys) if (!seen.has(key)) {
            const missing = objectStore.get(key)
            missing.onsuccess = () => result.push({ key: String(key), parentFormulaId: missing.result?.parentFormulaId })
          }
          keys = undefined
        }
        if (indexed) objectStore.getAllKeys().onsuccess = event => { keys = (event.target as IDBRequest<IDBValidKey[]>).result; readUnindexed() }
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) { cursorFinished = true; readUnindexed(); return }
          if (parentIndex) {
            // One callback per parent, rather than one per historical snapshot.
            const parentFormulaId = cursor.key as string, group = parentIndex.getAllKeys(cursor.key)
            pendingGroups++
            group.onsuccess = () => {
              for (const key of group.result) { seen.add(key); result.push({ key: String(key), parentFormulaId }) }
              pendingGroups--; readUnindexed()
            }
          } else result.push({ key: String(cursor.primaryKey), parentFormulaId: (cursor as IDBCursorWithValue).value.parentFormulaId })
          cursor.continue()
        }
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(tx.error ?? new Error('Parent reference query aborted'))
      })
    },
    async entries(store: StoreName) { return run(store, (objectStore) => objectStore.getAllKeys()).then((keys) => Promise.all(keys.map(async (key) => [String(key), await run(store, (objectStore) => objectStore.get(key))] as [string, StoreValue]))) },
    async put(store: StoreName, key: string, value: StoreValue) { await run(store, (objectStore) => objectStore.put(value, key)) },
    async add(store: StoreName, key: string, value: StoreValue) { await run(store, (objectStore) => objectStore.add(value, key)) },
    async delete(store: StoreName, key: string) { await run(store, (objectStore) => objectStore.delete(key)) },
    async clear() { for (const store of STORE_NAMES) await run(store, (objectStore) => objectStore.clear()) },
    async replaceAll(data, options = {}) {
      const palette = data.palette === undefined ? undefined : validatePaletteRecords(data.palette)
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAMES, 'readwrite')
        let failure: unknown
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('IndexedDB replacement aborted'))
        transaction.oncomplete = () => resolve()
        transaction.onerror = event => { failure ??= (event.target as IDBRequest)?.error ?? transaction.error }
        const applyReplacement = (existingExperimentReviews: ExperimentAiReviewRecord[] = []) => {
          try {
          const importedReviews = [...(data.reviews ?? []), ...existingExperimentReviews]
          if (new Set(importedReviews.map(item => item.reviewId)).size !== importedReviews.length) { transaction.abort(); return }
          for (const name of STORE_NAMES) if ((name !== 'palette' || palette !== undefined) && (name !== 'reviews' || data.reviews !== undefined || options.preserveExperimentReviews)) transaction.objectStore(name).clear()
          for (const item of palette ?? []) transaction.objectStore('palette').put(item, item.materialId)
          for (const item of data.formulas) transaction.objectStore('formulas').put(item, item.id)
          for (const item of data.archive) transaction.objectStore('archive').put(item, item.id)
          for (const item of data.versions ?? []) transaction.objectStore('versions').put(item, item.versionId)
          for (const item of data.experiments ?? []) transaction.objectStore('experiments').put(item, item.experimentId)
          if (data.reviews !== undefined || options.preserveExperimentReviews) for (const item of importedReviews) transaction.objectStore('reviews').put(item, item.reviewId)
          if (data.settings) transaction.objectStore('settings').put(data.settings, 'current')
          for (const [key, value] of Object.entries(data.meta)) transaction.objectStore('meta').put(value, key)
          } catch (error) { failure = error; transaction.abort() }
        }
        if (options.preserveExperimentReviews) {
          const request = transaction.objectStore('reviews').getAll()
          request.onsuccess = () => applyReplacement((request.result as AiReviewRecord[]).filter((value): value is ExperimentAiReviewRecord => typeof value === 'object' && value !== null && value.reviewType === 'experiment'))
        } else applyReplacement()
      })
    },
  }
}

export async function openDatabase(): Promise<StorageDatabase> {
  if (typeof indexedDB === 'undefined') return createMemoryDatabase()
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open(DB_NAME, DB_VERSION)
      openRequest.onupgradeneeded = () => {
        for (const name of STORE_NAMES) if (!openRequest.result.objectStoreNames.contains(name)) openRequest.result.createObjectStore(name)
        for (const name of ['versions', 'experiments']) {
          const store = openRequest.transaction!.objectStore(name)
          if (!store.indexNames.contains('parentFormulaId')) store.createIndex('parentFormulaId', 'parentFormulaId', { unique: false })
        }
        const reviews = openRequest.transaction!.objectStore('reviews')
        if (!reviews.indexNames.contains('sourceFormulaId')) reviews.createIndex('sourceFormulaId', 'sourceFormulaId', { unique: false })
        if (!reviews.indexNames.contains('experimentId')) reviews.createIndex('experimentId', 'experimentId', { unique: false })
      }
      openRequest.onsuccess = () => { openRequest.result.onversionchange = () => openRequest.result.close(); resolve(openRequest.result) }
      openRequest.onerror = () => reject(openRequest.error)
      openRequest.onblocked = () => reject(new Error('IndexedDB open blocked'))
    })
    return createIndexedDbDatabase(database)
  } catch {
    return createMemoryDatabase()
  }
}

export function createMemoryStorage(): StorageDatabase {
  return createMemoryDatabase()
}
