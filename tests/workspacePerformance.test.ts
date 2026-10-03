import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBIndex } from 'fake-indexeddb'
import { openDatabase } from '../src/storage/database'
import { createStorage } from '../src/storage/storageService'
import { workspaceUtf8Bytes } from '../src/services/workspaceValidation'
import { WorkspaceImportSession } from '../src/services/workspaceImportSession'
import { importWorkspace } from '../src/services/workspaceImporter'
import { engineFixture } from './workspaceEngineFixtures'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { remapWorkspace } from '../src/services/workspaceIdRemapping'
import { ensureTimeMachineIntegrity } from '../src/services/timeMachineIntegrity'

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Workspace performance boundaries',()=>{
  it('UTF-8 counting matches TextEncoder including unpaired surrogates',()=>{
    for(const text of ['', 'ASCII', '한글', 'é', '😀', '\ud800', '\udc00', '\ud800x\udc00', 'a'.repeat(1000)]) expect(workspaceUtf8Bytes(text)).toBe(new TextEncoder().encode(text).byteLength)
    for(let i=0;i<65536;i+=17){const text=String.fromCharCode(i,65535-i);expect(workspaceUtf8Bytes(text)).toBe(new TextEncoder().encode(text).byteLength)}
  })
  it.each([false,true])('creates indexes and preserves v3 data (upgrade=%s)',async upgrade=>{
    vi.stubGlobal('indexedDB',new IDBFactory())
    const {source,file}=await engineFixture()
    const archive={...source.formula,id:'archived'}
    if(upgrade)await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('accordbook',3)
      request.onupgradeneeded=()=>{for(const name of ['formulas','archive','versions','experiments','settings','meta'])request.result.createObjectStore(name)}
      request.onerror=()=>reject(request.error)
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction(['formulas','archive','versions','experiments','settings','meta'],'readwrite')
        tx.objectStore('formulas').put(source.formula,source.formula.id);tx.objectStore('archive').put(archive,archive.id)
        for(const v of source.versions)tx.objectStore('versions').put(v,v.versionId)
        for(const e of source.experiments)tx.objectStore('experiments').put(e,e.experimentId)
        tx.objectStore('settings').put({formulaIdPrefix:'QA',language:'ko'},'current');tx.objectStore('meta').put(12,'QA-2610')
        tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)
      }
    })
    const db=await openDatabase();expect(db.mode).toBe('indexeddb')
    if(!upgrade)await db.appendWorkspaceAtomic(source)
    await new Promise<void>((resolve,reject)=>{
      const r=indexedDB.open('accordbook',4);r.onerror=()=>reject(r.error);r.onsuccess=()=>{
        const tx=r.result.transaction(['versions','experiments'],'readonly')
        for(const name of ['versions','experiments'])expect(tx.objectStore(name).index('parentFormulaId').keyPath).toBe('parentFormulaId')
        tx.oncomplete=()=>{r.result.close();resolve()}
      }
    })
    const storage=await createStorage(),backup=await storage.exportData()
    expect(backup.formulas).toEqual([source.formula]);expect(backup.versions).toHaveLength(source.versions.length);expect(new Map(backup.experiments!.map(e=>[e.experimentId,e]))).toEqual(new Map(source.experiments.map(e=>[e.experimentId,e])))
    if(upgrade){expect(backup.archive).toEqual([archive]);expect(backup.settings).toEqual({formulaIdPrefix:'QA',language:'ko'});expect(backup.meta['QA-2610']).toBe(12)}
    await db.put('versions','other-v',{...source.versions[0],versionId:'other-v',parentFormulaId:'other'})
    await db.put('experiments','other-e',{...source.experiments[0],experimentId:'other-e',parentFormulaId:'other'})
    const spy=vi.spyOn(IDBIndex.prototype,'getAll')
    const versions=await storage.versions.listByParentFormulaId(source.formula.id),experiments=await storage.experiments.listByParentFormulaId(source.formula.id)
    expect(spy).toHaveBeenCalledTimes(2);expect(spy).toHaveBeenCalledWith(source.formula.id)
    expect(versions).toHaveLength(source.versions.length);expect(new Map(experiments.map(e=>[e.experimentId,e]))).toEqual(new Map(source.experiments.map(e=>[e.experimentId,e])))
    experiments[0].name='mutated';expect((await storage.experiments.get(source.experiments[0].experimentId))!.name).not.toBe('mutated')
    const read=(await storage.workspaces.readWorkspace(source.formula.id))!
    read.experiments=source.experiments.map(e=>read.experiments.find(v=>v.experimentId===e.experimentId)!)
    read.versions=source.versions.map(e=>read.versions.find(v=>v.versionId===e.versionId)!)
    expect(toWorkspaceFile(read,file.exportedAt)).toEqual(file)
    expect((await importWorkspace(storage,file)).ok).toBe(true)
    await storage.importData(backup);expect(await storage.exportData()).toEqual(backup)
  })
  it('private preparation freezes records; public copies cannot bypass validation',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    const {file}=await engineFixture(),session=await WorkspaceImportSession.open(file),storage=await createStorage()
    const records=await session.prepare('QA-2610-999',new Date().toISOString(),undefined)
    expect(Object.isFrozen(records.experiments[0].variants[0].snapshot.rows)).toBe(true)
    expect(()=>{records.versions[0].parentFormulaId='wrong'}).toThrow()
    const untrusted=structuredClone(records);untrusted.versions[0].parentFormulaId='wrong'
    await expect(storage.workspaces.appendWorkspaceAtomic(untrusted)).rejects.toThrow()
    expect(await storage.formulas.list()).toEqual([])
    await storage.workspaces.appendWorkspaceAtomic(records)
    expect(await storage.formulas.list()).toHaveLength(1)
  })
  it('isolates the session from later input edits and checks new display identities',async()=>{
    const {file}=await engineFixture(),expected=file.formula.notes,session=await WorkspaceImportSession.open(file)
    file.formula.notes='changed after validation'
    const records=await session.prepare('QA-2610-999',new Date().toISOString(),undefined)
    expect(records.formula.notes).toBe(expected)
    expect(()=>remapWorkspace(file,'',new Date().toISOString())).toThrow('identity')
  })
  it('reconciles indexed and unindexed orphan references without bulk snapshot reads',async()=>{
    vi.stubGlobal('indexedDB',new IDBFactory())
    const {source}=await engineFixture(),storage=await createStorage(),db=await openDatabase()
    await storage.workspaces.appendWorkspaceAtomic(source)
    await storage.versions.save({...source.versions[0],versionId:'orphan',parentFormulaId:'missing'})
    await db.put('versions','no-parent',{...source.versions[0],versionId:'no-parent',parentFormulaId:undefined} as any)
    const bulk=vi.spyOn(storage.versions,'listAll').mockRejectedValue(new Error('Must not read all snapshots'))
    expect(await ensureTimeMachineIntegrity(storage)).toBe(2)
    expect(bulk).not.toHaveBeenCalled()
    expect(await storage.versions.get('orphan')).toBeUndefined();expect(await storage.versions.get('no-parent')).toBeUndefined()
    expect(await storage.versions.listByParentFormulaId(source.formula.id)).toHaveLength(source.versions.length)
  })
  it('checks limits on newly generated provenance before any atomic write',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    const {source}=await engineFixture(),storage=await createStorage()
    source.versions=[];source.experiments=[];delete source.formula.provenance;delete source.formula.releasedVersionId
    source.formula.rows[0].material='x'.repeat(1_000_000)
    const file=toWorkspaceFile(source) // Valid input; canonical checkpoint text would exceed maxStringLength.
    const append=vi.spyOn(storage.workspaces,'appendWorkspaceAtomic')
    expect((await importWorkspace(storage,file)).ok).toBe(false)
    expect(append).not.toHaveBeenCalled();expect(await storage.formulas.list()).toEqual([])
  })
})
