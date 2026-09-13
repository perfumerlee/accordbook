export type VaultState = 'UNSUPPORTED' | 'NOT_CONNECTED' | 'CHECKING' | 'CONNECTED' | 'PERMISSION_REQUIRED' | 'FOLDER_NOT_AVAILABLE' | 'ERROR'

export type VaultHandle = FileSystemDirectoryHandle & { requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> }
type PickerWindow = Window & { showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<VaultHandle> }
const DB_NAME = 'accordbook-local-operator'
const STORE_NAME = 'formula-vault'
const RECORD_KEY = 'connection'
const SCHEMA_VERSION = 1

export type VaultRecord = { schemaVersion: number; directoryHandle: VaultHandle; connectedAt: string; lastConfirmedAt: string }

function pickerWindow(): PickerWindow { return window as PickerWindow }
function hasIndexedDb(): boolean { return typeof indexedDB !== 'undefined' }

export function isLocalFormulaVaultSupported(): boolean {
  try {
    return window.self === window.top && window.isSecureContext && typeof pickerWindow().showDirectoryPicker === 'function' && hasIndexedDb()
  } catch { return false }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb_unavailable'))
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    action(tx.objectStore(STORE_NAME), resolve, reject)
    tx.oncomplete = () => db.close()
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb_transaction_failed'))
  })
}

export async function loadVaultRecord(): Promise<VaultRecord | undefined> {
  if (!hasIndexedDb()) return undefined
  return transaction('readonly', (store, done, fail) => { const request = store.get(RECORD_KEY); request.onsuccess = () => done(request.result as VaultRecord | undefined); request.onerror = () => fail(request.error) })
}

export async function saveVaultRecord(directoryHandle: VaultHandle): Promise<VaultRecord> {
  const now = new Date().toISOString()
  const record: VaultRecord = { schemaVersion: SCHEMA_VERSION, directoryHandle, connectedAt: now, lastConfirmedAt: now }
  await transaction('readwrite', (store, done, fail) => { const request = store.put(record, RECORD_KEY); request.onsuccess = () => done(record); request.onerror = () => fail(request.error) })
  return record
}

export async function confirmVaultRecord(record: VaultRecord): Promise<void> {
  await transaction('readwrite', (store, done, fail) => { const request = store.put({ ...record, lastConfirmedAt: new Date().toISOString() }, RECORD_KEY); request.onsuccess = () => done(undefined); request.onerror = () => fail(request.error) })
}

export async function connectVault(): Promise<VaultHandle> {
  if (!isLocalFormulaVaultSupported()) throw new Error('unsupported')
  return pickerWindow().showDirectoryPicker!({ mode: 'readwrite' })
}

export async function requestVaultPermission(handle: VaultHandle): Promise<PermissionState> { return handle.requestPermission({ mode: 'readwrite' }) }
export async function queryVaultPermission(handle: VaultHandle): Promise<PermissionState> { return handle.queryPermission({ mode: 'readwrite' }) }
export async function disconnectVault(): Promise<void> {
  await transaction('readwrite', (store, done, fail) => { const request = store.delete(RECORD_KEY); request.onsuccess = () => done(undefined); request.onerror = () => fail(request.error) })
}
