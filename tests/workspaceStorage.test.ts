import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBDatabase, IDBObjectStore } from 'fake-indexeddb'
import { createMemoryStorage, openDatabase, type StorageDatabase } from '../src/storage/database'
import { WorkspaceRepository, type WorkspaceAppend } from '../src/storage/workspaceRepository'
import { workspaceFixture } from './workspaceFixtures'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function input(): Promise<WorkspaceAppend> { return { ...await workspaceFixture(), metaUpdate: { key: 'ACC-2610', value: 7, expectedValue: null } } }
async function contents(db: StorageDatabase) {
  return { formulas: await db.getAll('formulas'), archive: await db.getAll('archive'), versions: await db.getAll('versions'), experiments: await db.getAll('experiments'), meta: await db.entries('meta') }
}
for (const mode of ['memory', 'indexeddb'] as const) describe(`Workspace atomic storage: ${mode}`, () => {
  let db: StorageDatabase
  beforeEach(async () => { vi.stubGlobal('indexedDB', new IDBFactory()); db = mode === 'memory' ? createMemoryStorage() : await openDatabase(); expect(db.mode).toBe(mode) })

  it('appends all records/meta while preserving unrelated stores and returning isolated coherent reads', async () => {
    const value = await input()
    await db.put('formulas', 'unrelated', { ...value.formula, id: 'unrelated' })
    await db.put('versions', 'unrelated-v', { ...value.versions[0], versionId: 'unrelated-v', parentFormulaId: 'unrelated' })
    await db.put('experiments', 'unrelated-e', { ...value.experiments[0], experimentId: 'unrelated-e', parentFormulaId: 'unrelated' })
    await db.put('meta', 'OTHER', 50)
    const before = await contents(db)
    const repo = new WorkspaceRepository(db)
    await repo.appendWorkspaceAtomic(value)
    const result = (await repo.readWorkspace(value.formula.id))!
    expect(result.formula).toEqual(value.formula)
    expect(new Set(result.versions.map(v => v.versionId))).toEqual(new Set(value.versions.map(v => v.versionId)))
    expect(result.experiments).toEqual(value.experiments)
    expect(await db.get('meta', 'ACC-2610')).toBe(7)
    expect(await db.get('formulas', 'unrelated')).toEqual(before.formulas[0])
    expect(await db.get('versions', 'unrelated-v')).toEqual(before.versions[0])
    expect(await db.get('experiments', 'unrelated-e')).toEqual(before.experiments[0])
    expect(await db.get('meta', 'OTHER')).toBe(50)
    result.formula.name = 'mutated read'; value.formula.notes = 'mutated input'
    expect((await repo.readWorkspace(value.formula.id))!.formula.name).toBe('Workspace')
    expect((await repo.readWorkspace(value.formula.id))!.formula.notes).toBe('Private notes')
    expect(await repo.readWorkspace('missing')).toBeUndefined()
    await db.put('archive', 'archived', { ...value.formula, id: 'archived' })
    expect(await repo.readWorkspace('archived')).toBeUndefined()
  })
  it.each(['formulas', 'archive', 'versions', 'experiments'] as const)('rolls back every store on %s identity collision', async store => {
    const value = await input()
    const record = store === 'versions' ? value.versions[0] : store === 'experiments' ? value.experiments[0] : value.formula
    const key = store === 'versions' ? value.versions[0].versionId : store === 'experiments' ? value.experiments[0].experimentId : value.formula.id
    await db.put(store, key, record)
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(value)).rejects.toThrow()
    expect(await contents(db)).toEqual(before)
  })
  it('rolls back staged memory changes / IndexedDB writes when the meta compare-and-set fails', async () => {
    const value = await input(); await db.put('meta', value.metaUpdate!.key, 99)
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(value)).rejects.toThrow('sequence changed')
    expect(await contents(db)).toEqual(before)
  })
  it('commits an expected existing meta sequence and rejects a stale retry', async () => {
    const value = await input(); await db.put('meta', value.metaUpdate!.key, 6); value.metaUpdate!.expectedValue = 6
    await db.appendWorkspaceAtomic(value)
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(value)).rejects.toThrow()
    expect(await contents(db)).toEqual(before)
  })
  it('rejects invalid graph/clone errors before mutating storage', async () => {
    const value = await input(); value.versions[0].parentFormulaId = 'wrong'
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(value)).rejects.toThrow()
    expect(await contents(db)).toEqual(before)
    Object.assign(value.formula, { uncloneable: () => undefined })
    await expect(db.appendWorkspaceAtomic(value)).rejects.toThrow()
    expect(await contents(db)).toEqual(before)
  })
})

describe('IndexedDB transaction event semantics', () => {
  let db: StorageDatabase
  beforeEach(async () => { vi.stubGlobal('indexedDB', new IDBFactory()); db = await openDatabase() })
  it.each(['formulas', 'versions'] as const)('aborts after %s request success without partial records or meta', async store => {
    const add = IDBObjectStore.prototype.add
    let requestSucceeded = false
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      const req = add.apply(this, args)
      if (this.name === store) req.addEventListener('success', () => { requestSucceeded = true; this.transaction.abort() }, { once: true })
      return req
    })
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(await input())).rejects.toThrow()
    expect(requestSucceeded).toBe(true)
    expect(await contents(db)).toEqual(before)
  })
  it('aborts on a meta write error after earlier writes were queued', async () => {
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'meta') throw new DOMException('Injected quota error', 'QuotaExceededError')
      return put.apply(this, args)
    })
    const before = await contents(db)
    await expect(db.appendWorkspaceAtomic(await input())).rejects.toThrow('quota')
    expect(await contents(db)).toEqual(before)
  })
  it('resolves only after oncomplete, and reads in one readonly transaction', async () => {
    const transaction = IDBDatabase.prototype.transaction
    let complete = false; let requestSuccess = false; let resolved = false
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = transaction.apply(this, args)
      tx.addEventListener('complete', () => { complete = true })
      return tx
    })
    const add = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      const req = add.apply(this, args)
      req.addEventListener('success', () => { requestSuccess = true; expect(resolved).toBe(false); expect(complete).toBe(false) })
      return req
    })
    const value = await input()
    await db.appendWorkspaceAtomic(value).then(() => { resolved = true; expect(complete).toBe(true) })
    expect(requestSuccess).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockClear(); complete = false
    await db.readWorkspace(value.formula.id)
    expect(complete).toBe(true)
    expect(spy).toHaveBeenCalledExactlyOnceWith(['formulas', 'versions', 'experiments'], 'readonly')
  })
  it('does not mix generations when another transaction writes during a coherent read', async () => {
    const value = await input(); await db.appendWorkspaceAtomic(value)
    const transaction = IDBDatabase.prototype.transaction
    let writer: Promise<void> | undefined
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = transaction.apply(this, args)
      if (args[1] === 'readonly' && !writer) {
        writer = new Promise<void>((resolve, reject) => {
          const write = transaction.call(this, ['formulas', 'versions', 'experiments'], 'readwrite')
          write.oncomplete = () => resolve(); write.onabort = () => reject(write.error)
          write.objectStore('formulas').put({ ...value.formula, name: 'NEW' }, value.formula.id)
          for (const v of value.versions) write.objectStore('versions').put({ ...v, note: 'NEW' }, v.versionId)
          for (const e of value.experiments) write.objectStore('experiments').put({ ...e, name: 'NEW' }, e.experimentId)
        })
      }
      return tx
    })
    const old = (await db.readWorkspace(value.formula.id))!
    expect(old.formula.name).toBe('Workspace')
    expect(old.versions.every(v => v.note === 'Version note')).toBe(true)
    expect(old.experiments.every(e => e.name !== 'NEW')).toBe(true)
    await writer
    const next = (await db.readWorkspace(value.formula.id))!
    expect(next.formula.name).toBe('NEW')
    expect(next.versions.every(v => v.note === 'NEW')).toBe(true)
    expect(next.experiments.every(e => e.name === 'NEW')).toBe(true)
  })
})
