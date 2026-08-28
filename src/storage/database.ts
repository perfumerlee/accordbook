import type { Formula } from '../models/formula'
import type { AccordbookSettings } from '../models/settings'

export type StoreName = 'formulas' | 'archive' | 'settings' | 'meta'
export type StorageMode = 'indexeddb' | 'memory'

type StoreValue = Formula | AccordbookSettings | number
type StoreMap = Map<string, StoreValue>

const DB_NAME = 'accordbook'
const DB_VERSION = 1
const STORE_NAMES: StoreName[] = ['formulas', 'archive', 'settings', 'meta']

export interface StorageDatabase {
  readonly mode: StorageMode
  get<T extends StoreValue>(store: StoreName, key: string): Promise<T | undefined>
  getAll<T extends StoreValue>(store: StoreName): Promise<T[]>
  put(store: StoreName, key: string, value: StoreValue): Promise<void>
  delete(store: StoreName, key: string): Promise<void>
  clear(): Promise<void>
}

function createMemoryDatabase(): StorageDatabase {
  const stores = new Map<StoreName, StoreMap>(STORE_NAMES.map((name) => [name, new Map()]))
  return {
    mode: 'memory',
    async get<T extends StoreValue>(store: StoreName, key: string) { return stores.get(store)!.get(key) as T | undefined },
    async getAll<T extends StoreValue>(store: StoreName) { return [...stores.get(store)!.values()] as T[] },
    async put(store: StoreName, key: string, value: StoreValue) { stores.get(store)!.set(key, value) },
    async delete(store: StoreName, key: string) { stores.get(store)!.delete(key) },
    async clear() { stores.forEach((store) => store.clear()) },
  }
}

function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function createIndexedDbDatabase(database: IDBDatabase): StorageDatabase {
  const run = async <T>(store: StoreName, operation: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const transaction = database.transaction(store, 'readwrite')
    return request(operation(transaction.objectStore(store)))
  }
  return {
    mode: 'indexeddb',
    async get<T extends StoreValue>(store: StoreName, key: string) { return run(store, (objectStore) => objectStore.get(key)) as Promise<T | undefined> },
    async getAll<T extends StoreValue>(store: StoreName) { return run(store, (objectStore) => objectStore.getAll()) as Promise<T[]> },
    async put(store: StoreName, key: string, value: StoreValue) { await run(store, (objectStore) => objectStore.put(value, key)) },
    async delete(store: StoreName, key: string) { await run(store, (objectStore) => objectStore.delete(key)) },
    async clear() { for (const store of STORE_NAMES) await run(store, (objectStore) => objectStore.clear()) },
  }
}

export async function openDatabase(): Promise<StorageDatabase> {
  if (typeof indexedDB === 'undefined') return createMemoryDatabase()
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open(DB_NAME, DB_VERSION)
      openRequest.onupgradeneeded = () => {
        for (const name of STORE_NAMES) if (!openRequest.result.objectStoreNames.contains(name)) openRequest.result.createObjectStore(name)
      }
      openRequest.onsuccess = () => resolve(openRequest.result)
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
