import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { createStorage } from '../src/storage/storageService'
import { importWorkspace, WORKSPACE_IMPORT_ATTEMPTS } from '../src/services/workspaceImporter'
import { WorkspaceAppendConflict } from '../src/storage/workspaceRepository'
import { engineFixture } from './workspaceEngineFixtures'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { createExperimentFromCurrent } from '../src/services/experimentLifecycle'

const now = new Date(2026, 9, 1, 12)
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
for (const mode of ['memory', 'indexeddb'] as const) describe(`Workspace importer: ${mode}`, () => {
  beforeEach(() => { vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined) })
  it('imports twice with independent runtime IDs, local display IDs, counts and original metadata', async () => {
    const storage = await createStorage(); const { file } = await engineFixture()
    const a = await importWorkspace(storage, file, { now }); const b = await importWorkspace(storage, file, { now })
    if (!a.ok || !b.ok) throw new Error(JSON.stringify({ a, b }))
    expect(a.formulaId).not.toBe(b.formulaId); expect(a.displayFormulaId).not.toBe(b.displayFormulaId)
    expect(a.displayFormulaId).not.toBe(file.formula.formulaId)
    expect(a).toMatchObject({ versionCount: 2, experimentCount: 2, variantCount: 5, branchCount: 3, evaluationCount: 3, persistence: mode })
    const wa = (await storage.workspaces.readWorkspace(a.formulaId))!; const wb = (await storage.workspaces.readWorkspace(b.formulaId))!
    expect(wa.formula.workspaceImport).toEqual({ sourceFormulaId: file.formula.formulaId, importedAt: now.toISOString() })
    expect(wa.formula.createdAt).toBe(file.formula.createdAt); expect(wa.formula.updatedAt).toBe(file.formula.updatedAt)
    expect(wa.versions.map(v => v.versionId).some(id => wb.versions.some(v => v.versionId === id))).toBe(false)
    expect(wa.experiments.flatMap(e => e.variants.map(v => v.variantId)).some(id => wb.experiments.some(e => e.variants.some(v => v.variantId === id)))).toBe(false)
  })
  it('uses local prefix and skips active/archive display collisions without pre-consuming a counter', async () => {
    const storage = await createStorage(); const { file, source } = await engineFixture()
    await storage.settings.save({ language: 'ko', formulaIdPrefix: 'LAB' })
    await storage.formulas.save({ ...source.formula, id: 'occupied-a', formulaId: 'LAB-2610-001' })
    await storage.formulas.save({ ...source.formula, id: 'occupied-b', formulaId: 'LAB-2610-002' })
    await storage.formulas.moveToArchive((await storage.formulas.get('occupied-b'))!)
    const result = await importWorkspace(storage, file, { now })
    expect(result).toMatchObject({ ok: true, displayFormulaId: 'LAB-2610-003' })
    expect(await storage.meta.getSequence('LAB-2610')).toBe(3)
    expect((await storage.archive.get('occupied-b'))!.formulaId).toBe('LAB-2610-002')
  })
  it('retries a deterministic meta CAS conflict and stops after a bounded number', async () => {
    const storage = await createStorage(); const { file } = await engineFixture()
    const append = storage.workspaces.appendWorkspaceAtomic.bind(storage.workspaces)
    const spy = vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic').mockImplementationOnce(async value => {
      await storage.meta.setSequence(value.metaUpdate!.key, 20)
      return append(value)
    }).mockImplementation(append)
    expect(await importWorkspace(storage, file, { now })).toMatchObject({ ok: true, displayFormulaId: 'ACC-2610-021' })
    expect(spy).toHaveBeenCalledTimes(2)
    const before = await storage.exportData()
    spy.mockReset().mockRejectedValue(new WorkspaceAppendConflict('meta-changed'))
    expect(await importWorkspace(storage, file, { now })).toEqual({ ok: false, code: 'concurrent-allocation' })
    expect(spy).toHaveBeenCalledTimes(WORKSPACE_IMPORT_ATTEMPTS)
    expect(await storage.exportData()).toEqual(before)
  })
  it('rechecks active display collisions inside append even after an earlier allocation proposal', async () => {
    const storage = await createStorage(); const { file, source } = await engineFixture()
    const append = storage.workspaces.appendWorkspaceAtomic.bind(storage.workspaces)
    vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic').mockImplementationOnce(async value => {
      await storage.formulas.save({ ...source.formula, id: 'racing-display', formulaId: value.formula.formulaId })
      return append(value)
    }).mockImplementation(append)
    expect(await importWorkspace(storage, file, { now })).toMatchObject({ ok: true, displayFormulaId: 'ACC-2610-003' })
    expect(await storage.formulas.list()).toHaveLength(2)
  })
  it.each(['versions', 'experiments', 'none'] as const)('supports history subset: %s', async subset => {
    const storage = await createStorage(); const { source } = await engineFixture()
    if (subset !== 'versions') {
      source.versions = []; delete source.formula.releasedVersionId
      source.formula.provenance!.revisions.forEach(r => { delete r.restoredFromVersionId })
      source.experiments = subset === 'experiments' ? [createExperimentFromCurrent(source.formula)] : []
    } else source.experiments = []
    expect(await importWorkspace(storage, toWorkspaceFile(source), { now })).toMatchObject({ ok: true })
  })
  it('does not write on invalid input or commit failure and leaves sequences untouched', async () => {
    const storage = await createStorage(); const { file } = await engineFixture(); const before = await storage.exportData()
    const append = vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic')
    const invalid = structuredClone(file); invalid.formula.releasedVersionId = 'missing'
    expect(await importWorkspace(storage, invalid, { now })).toEqual({ ok: false, code: 'invalid-workspace' })
    expect(append).not.toHaveBeenCalled()
    append.mockRejectedValue(new Error('commit failure'))
    expect(await importWorkspace(storage, file, { now })).toEqual({ ok: false, code: 'atomic-commit-failed' })
    expect(await storage.exportData()).toEqual(before)
  })
})
describe('Importer IndexedDB failure injection', () => {
  beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
  it.each(['formulas', 'versions', 'experiments'])('aborts %s add without any sequence leakage', async store => {
    const storage = await createStorage(); const { file } = await engineFixture(); const before = await storage.exportData()
    const add = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === store) throw new DOMException('Injected failure', 'QuotaExceededError')
      return add.apply(this, args)
    })
    expect(await importWorkspace(storage, file, { now })).toEqual({ ok: false, code: 'atomic-commit-failed' })
    expect(await storage.exportData()).toEqual(before)
  })
  it('handles abort after an individual add succeeds', async () => {
    const storage = await createStorage(); const { file } = await engineFixture(); const before = await storage.exportData()
    const add = IDBObjectStore.prototype.add
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      const request = add.apply(this, args)
      if (this.name === 'versions') request.addEventListener('success', () => this.transaction.abort(), { once: true })
      return request
    })
    expect(await importWorkspace(storage, file, { now })).toEqual({ ok: false, code: 'atomic-commit-failed' })
    expect(await storage.exportData()).toEqual(before)
  })
})
