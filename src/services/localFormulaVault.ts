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

export type VaultSaveResult = { status: 'SAVED' | 'ALREADY_SAVED'; fileName: string; packageId: string } | { status: 'PERMISSION_REQUIRED' | 'SAVE_FAILED'; error?: unknown }
const safeSlug = /^\d{4}-\d{3}$/
function safeFileName(value: string): boolean { return !!value && value.length <= 255 && /\.accordbook$/i.test(value) && !/[\\/\0-\x1f\x7f]/.test(value) && value !== '.' && value !== '..' }
function collisionName(fileName: string, packageId: string): string { return fileName.replace(/\.accordbook$/i, '') + '--' + packageId.replace(/[^a-z0-9]/gi, '').slice(0, 8) + '.accordbook' }

export async function saveFormulaDropPackage(options: { rootHandle: VaultHandle; slug: string; fileName: string; blob: Blob; packageId: string }): Promise<VaultSaveResult> {
  if (!safeSlug.test(options.slug) || !safeFileName(options.fileName) || !options.blob.size || !options.packageId) return { status: 'SAVE_FAILED', error: new Error('invalid_package_target') }
  try {
    if (await queryVaultPermission(options.rootHandle) !== 'granted') return { status: 'PERMISSION_REQUIRED' }
    const directory = await options.rootHandle.getDirectoryHandle(options.slug, { create: true })
    let targetName = options.fileName
    let target: FileSystemFileHandle
    try { target = await directory.getFileHandle(targetName, { create: false }); const existing = await target.getFile(); const text = await existing.text(); const parsed = JSON.parse(text) as { packageId?: string }; if (parsed.packageId === options.packageId) return { status: 'ALREADY_SAVED', fileName: targetName, packageId: options.packageId }; targetName = collisionName(options.fileName, options.packageId) } catch (error) { if (error instanceof DOMException && error.name !== 'NotFoundError') throw error }
    target = await directory.getFileHandle(targetName, { create: true })
    const writable = await target.createWritable()
    try { await writable.write(options.blob); await writable.close() } catch (error) { try { await writable.abort?.() } catch { /* best effort */ } return { status: 'SAVE_FAILED', error } }
    return { status: 'SAVED', fileName: targetName, packageId: options.packageId }
  } catch (error) { return { status: 'SAVE_FAILED', error } }
}
