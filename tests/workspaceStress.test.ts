import { afterEach, describe, expect, it, vi } from 'vitest'
import { stressFixture, normalizeStressImport } from './workspaceStressFixture'
import { createStorage } from '../src/storage/storageService'
import { importWorkspace } from '../src/services/workspaceImporter'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { validateWorkspaceFile } from '../src/services/workspaceValidation'
import { compareFormulaSnapshots } from '../src/services/formulaVersionCompare'

afterEach(()=>vi.unstubAllGlobals())
describe('Workspace final stress acceptance',()=>{
  it('maximum text length round-trips and one over rejects without writes',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    const source=await stressFixture({materials:4,versions:0,points:0,experiments:0,revisions:2})
    delete source.formula.provenance
    source.formula.notes='한'.repeat(1_000_000)
    const file=toWorkspaceFile(source),storage=await createStorage(),result=await importWorkspace(storage,file)
    if(!result.ok)throw Error(result.code)
    expect((await storage.formulas.get(result.formulaId))!.notes).toBe(source.formula.notes)
    const before=await storage.exportData()
    file.formula.notes+='한'
    expect((await importWorkspace(storage,file)).ok).toBe(false)
    expect(await storage.exportData()).toEqual(before)
  })
  it('large memory fallback preserves every semantic field and independent repeated imports',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    const source=await stressFixture(), file=toWorkspaceFile(source), storage=await createStorage()
    const a=await importWorkspace(storage,file),b=await importWorkspace(storage,file)
    if(!a.ok||!b.ok)throw Error('import failed')
    expect(a.persistence).toBe('memory');expect(a.displayFormulaId).not.toBe(b.displayFormulaId)
    const restored=(await storage.workspaces.readWorkspace(a.formulaId))!
    expect(normalizeStressImport(restored,file)).toEqual(file)
    const original=compareFormulaSnapshots(source.versions[0].snapshot,source.versions[1].snapshot)
    const found=(note:string)=>restored.versions.find(v=>v.note===note)!
    expect(compareFormulaSnapshots(found('Version note 0').snapshot,found('Version note 1').snapshot)).toEqual(original)
  },120000)
  it.each([50,256,257])('genealogy depth %i respects the 256 node limit',async(depth)=>{
    vi.stubGlobal('indexedDB',undefined)
    const source=await stressFixture({materials:4,versions:1,points:0,experiments:1,variants:1,revisions:2})
    const e=source.experiments[0],root=e.variants[0]
    e.variants=Array.from({length:depth},(_,i)=>({...structuredClone(root),variantId:`v-${i}`,parentVariantId:i?`v-${i-1}`:null,label:'A'+'.1'.repeat(i)}))
    const raw={type:'accordbook-workspace',formatVersion:1,exportedAt:source.formula.createdAt,...source}
    // Project domain rows into the strict external contract.
    const file=JSON.parse(JSON.stringify(raw));file.formula.rows.forEach((r:{id?:string})=>delete r.id)
    if(depth<=256)expect(validateWorkspaceFile(file).experiments[0].variants).toHaveLength(depth)
    else {const storage=await createStorage();expect((await importWorkspace(storage,file)).ok).toBe(false);expect(await storage.formulas.list()).toEqual([])}
  })
  it.each([[0,0],[3,0],[0,2]])('minimal history versions=%i experiments=%i',async(versions,experiments)=>{
    vi.stubGlobal('indexedDB',undefined);const source=await stressFixture({materials:4,versions,points:0,experiments,variants:2,revisions:2})
    const file=toWorkspaceFile(source),storage=await createStorage(),result=await importWorkspace(storage,file)
    if(!result.ok)throw Error(result.code)
    expect(normalizeStressImport((await storage.workspaces.readWorkspace(result.formulaId))!,file)).toEqual(file)
  })
  it('deterministic malformed fixtures and historical tampering cannot write',async()=>{
    vi.stubGlobal('indexedDB',undefined);const source=await stressFixture({materials:4,versions:1,points:0,experiments:1,variants:8,revisions:30})
    const file=toWorkspaceFile(source),storage=await createStorage(),before=await storage.exportData()
    const mutations:((f:any)=>void)[]=[f=>f.formula.notes=3,f=>delete f.experiments[0].baseSnapshot,f=>f.versions.push(f.versions[0]),f=>f.experiments[0].variants[6].parentVariantId='missing',f=>f.experiments[0].variants[0].parentVariantId=f.experiments[0].variants[6].variantId,f=>f.experiments[0].variants[0].evaluations[0].verdict='bad',f=>f.formula.createdAt='yesterday',f=>f.formula.rows[0].dilution.percent=101,f=>f.formula.rows[0].parts=null,f=>f.unknown={nested:{unknown:true}},f=>f.formula.provenance.revisions[15].contentFingerprint='a'.repeat(64),f=>f.formula.provenance.currentFingerprint='b'.repeat(64),f=>f.formula.provenance.checkpoint.formulaSnapshot+='tampered']
    for(const mutate of mutations){const damaged=structuredClone(file);mutate(damaged);expect((await importWorkspace(storage,damaged)).ok).toBe(false);expect(await storage.exportData()).toEqual(before)}
  })
})
