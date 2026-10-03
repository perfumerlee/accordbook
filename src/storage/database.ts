import type { Formula, FormulaVersion } from '../models/formula'
import type { Experiment } from '../models/experiment'
import type { AccordbookSettings } from '../models/settings'
import { appendIndexedWorkspace, readIndexedWorkspace, prepareWorkspaceAppend, WorkspaceAppendConflict, type WorkspaceAppend, type WorkspaceRecords } from './workspaceRepository'

export type StoreName = 'formulas' | 'archive' | 'versions' | 'settings' | 'meta' | 'experiments'
export type StorageMode = 'indexeddb' | 'memory'

type StoreValue = Formula | FormulaVersion | Experiment | AccordbookSettings | number
type StoreMap = Map<string, StoreValue>

const DB_NAME = 'accordbook'
const DB_VERSION = 4
const STORE_NAMES: StoreName[] = ['formulas', 'archive', 'versions', 'settings', 'meta', 'experiments']

export interface StorageDatabase {
  readonly mode: StorageMode
  readWorkspace(formulaId: string): Promise<WorkspaceRecords | undefined>
  appendWorkspaceAtomic(input: WorkspaceAppend): Promise<void>
  get<T extends StoreValue>(store: StoreName, key: string): Promise<T | undefined>
  getAll<T extends StoreValue>(store: StoreName): Promise<T[]>
  /** Returns owned copies, including in memory mode. */
  getByParent<T extends FormulaVersion | Experiment>(store: 'versions' | 'experiments', parentFormulaId: string): Promise<T[]>
  getParentReferences(store: 'versions' | 'experiments'): Promise<{ key: string; parentFormulaId: string }[]>
  entries(store: StoreName): Promise<Array<[string, StoreValue]>>
  put(store: StoreName, key: string, value: StoreValue): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
  clear(): Promise<void>
  replaceAll(data: { formulas: Formula[]; archive: Formula[]; versions?: FormulaVersion[]; experiments?: Experiment[]; settings?: AccordbookSettings; meta: Record<string, number> }): Promise<void>
}

function createMemoryDatabase(): StorageDatabase {
  let stores = new Map<StoreName, StoreMap>(STORE_NAMES.map((name) => [name, new Map()]))
  return {
    mode: 'memory',
    async readWorkspace(formulaId) {
      const formula = stores.get('formulas')!.get(formulaId) as Formula | undefined
      if (!formula) return undefined
      return structuredClone({ formula,
        versions: [...stores.get('versions')!.values()].filter(v => (v as FormulaVersion).parentFormulaId === formulaId) as FormulaVersion[],
        experiments: [...stores.get('experiments')!.values()].filter(e => (e as Experiment).parentFormulaId === formulaId) as Experiment[] })
    },
    async appendWorkspaceAtomic(input) {
      const value = prepareWorkspaceAppend(input)
      const staged = new Map(stores)
      for (const name of ['formulas', 'versions', 'experiments', 'meta'] as const) staged.set(name, new Map(stores.get(name)!))
      if (stores.get('archive')!.has(value.formula.id)) throw new Error('Formula identity already exists in Archive')
      if (value.checkDisplayId && ['formulas', 'archive'].some(name => [...stores.get(name as StoreName)!.values()].some(record => (record as Formula).formulaId === value.formula.formulaId))) throw new WorkspaceAppendConflict('display-id-collision')
      const add = (store: StoreName, key: string, record: StoreValue) => {
        if (staged.get(store)!.has(key)) throw new Error('Workspace identity collision')
        staged.get(store)!.set(key, record)
      }
      add('formulas', value.formula.id, value.formula)
      for (const version of value.versions) add('versions', version.versionId, version)
      for (const experiment of value.experiments) add('experiments', experiment.experimentId, experiment)
      if (value.metaUpdate) {
        const { key, value: sequence, expectedValue } = value.metaUpdate
        if ((staged.get('meta')!.get(key) ?? null) !== expectedValue) throw new WorkspaceAppendConflict('meta-changed')
        staged.get('meta')!.set(key, sequence)
      }
      stores = staged
    },
    async get<T extends StoreValue>(store: StoreName, key: string) { return stores.get(store)!.get(key) as T | undefined },
    async getAll<T extends StoreValue>(store: StoreName) { return [...stores.get(store)!.values()] as T[] },
    async getByParent<T extends FormulaVersion | Experiment>(store: 'versions' | 'experiments', parentFormulaId: string) { return structuredClone([...stores.get(store)!.values()].filter(v => (v as T).parentFormulaId === parentFormulaId)) as T[] },
    async getParentReferences(store) { return [...stores.get(store)!.entries()].map(([key, value]) => ({ key, parentFormulaId: (value as FormulaVersion | Experiment).parentFormulaId })) },
    async entries(store: StoreName) { return [...stores.get(store)!.entries()] },
    async put(store: StoreName, key: string, value: StoreValue) { stores.get(store)!.set(key, value) },
    async delete(store: StoreName, key: string) { stores.get(store)!.delete(key) },
    async clear() { stores.forEach((store) => store.clear()) },
    async replaceAll(data) { await this.clear(); for (const item of data.formulas) await this.put('formulas', item.id, item); for (const item of data.archive) await this.put('archive', item.id, item); for (const item of data.versions ?? []) await this.put('versions', item.versionId, item); for (const item of data.experiments ?? []) await this.put('experiments', item.experimentId, item); if (data.settings) await this.put('settings', 'current', data.settings); for (const [key, value] of Object.entries(data.meta)) await this.put('meta', key, value) },
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
    readWorkspace(formulaId) { return readIndexedWorkspace(database, formulaId) },
    async appendWorkspaceAtomic(input) { await appendIndexedWorkspace(database, input) },
    async get<T extends StoreValue>(store: StoreName, key: string) { return run(store, (objectStore) => objectStore.get(key)) as Promise<T | undefined> },
    async getAll<T extends StoreValue>(store: StoreName) { return run(store, (objectStore) => objectStore.getAll()) as Promise<T[]> },
    async getByParent<T extends FormulaVersion | Experiment>(store: 'versions' | 'experiments', parentFormulaId: string) {
      return new Promise<T[]>((resolve, reject) => {
        const tx = database.transaction(store, 'readonly'), objectStore = tx.objectStore(store)
        const indexed = objectStore.indexNames.contains('parentFormulaId')
        const request = indexed ? objectStore.index('parentFormulaId').getAll(parentFormulaId) : objectStore.getAll()
        let result: T[] = []
        request.onsuccess = () => { result = indexed ? request.result : request.result.filter((v: T) => v.parentFormulaId === parentFormulaId) }
        tx.oncomplete = () => resolve(result)
        tx.onabort = () => reject(tx.error ?? new Error('Scoped query aborted'))
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
    async delete(store: StoreName, key: string) { await run(store, (objectStore) => objectStore.delete(key)) },
    async clear() { for (const store of STORE_NAMES) await run(store, (objectStore) => objectStore.clear()) },
    async replaceAll(data) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAMES, 'readwrite')
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB replacement failed'))
        for (const name of STORE_NAMES) transaction.objectStore(name).clear()
        for (const item of data.formulas) transaction.objectStore('formulas').put(item, item.id)
        for (const item of data.archive) transaction.objectStore('archive').put(item, item.id)
        for (const item of data.versions ?? []) transaction.objectStore('versions').put(item, item.versionId)
        for (const item of data.experiments ?? []) transaction.objectStore('experiments').put(item, item.experimentId)
        if (data.settings) transaction.objectStore('settings').put(data.settings, 'current')
        for (const [key, value] of Object.entries(data.meta)) transaction.objectStore('meta').put(value, key)
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
