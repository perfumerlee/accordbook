import { beforeEach, describe, expect, it, vi } from 'vitest'
import { disconnectVault, isLocalFormulaVaultSupported, queryVaultPermission, requestVaultPermission, saveVaultRecord, type VaultHandle } from '../src/services/localFormulaVault'

function idbMock() {
  const values = new Map<string, unknown>()
  const request = () => { const value: any = {}; queueMicrotask(() => value.onsuccess?.()); return value }
  return { open: vi.fn(() => { const openRequest: any = {}; queueMicrotask(() => { openRequest.result = { transaction: () => ({ objectStore: () => ({ get: (key: string) => { const result: any = request(); queueMicrotask(() => { result.result = values.get(key); result.onsuccess?.() }); return result }, put: (value: unknown, key: string) => { values.set(key, value); return request() }, delete: (key: string) => { values.delete(key); return request() } }) }), close: vi.fn() }; openRequest.onsuccess?.() }); return openRequest }) } }

beforeEach(() => { vi.restoreAllMocks(); Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: idbMock() }); Object.defineProperty(globalThis, 'window', { configurable: true, value: { self: undefined, top: undefined, isSecureContext: true, showDirectoryPicker: vi.fn() } }); (globalThis as any).window.self = (globalThis as any).window; (globalThis as any).window.top = (globalThis as any).window })

describe('local Formula Vault', () => {
  it('rejects unsupported browser capabilities', () => { Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined }); expect(isLocalFormulaVaultSupported()).toBe(false) })
  it('persists a directory handle record and can disconnect it', async () => { const handle = { name: 'Formula Drops', queryPermission: vi.fn(), requestPermission: vi.fn() } as unknown as VaultHandle; expect((await saveVaultRecord(handle)).directoryHandle).toBe(handle); await disconnectVault() })
  it('delegates permission checks to the handle', async () => { const handle = { queryPermission: vi.fn().mockResolvedValue('granted'), requestPermission: vi.fn().mockResolvedValue('denied') } as unknown as VaultHandle; expect(await queryVaultPermission(handle)).toBe('granted'); expect(await requestVaultPermission(handle)).toBe('denied') })
})
