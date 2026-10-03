import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceExecution } from '../src/services/workspaceExecution'
import { WorkspaceUiError } from '../src/services/workspaceUi'
import { WorkspaceValidationError } from '../src/services/workspaceValidation'
import { importWorkspace } from '../src/services/workspaceImporter'
import { createStorage } from '../src/storage/storageService'
import { engineFixture } from './workspaceEngineFixtures'
import { WorkspaceImportSession } from '../src/services/workspaceImportSession'

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
class TestWorker {
  static latest: TestWorker
  onmessage?: (event: any) => void
  onerror?: () => void
  onmessageerror?: () => void
  terminate=vi.fn()
  postMessage=vi.fn()
  constructor(){TestWorker.latest=this}
}
describe('Workspace worker lifecycle',()=>{
  it.each(['accordbook-formula', 'accordbook-paid-package'])('routes %s without constructing a Workspace Worker', async type => {
    const worker = vi.fn(function () { throw new Error('Worker blocked') })
    vi.stubGlobal('Worker', worker)
    const session = await WorkspaceImportSession.open(JSON.stringify({ type, formatVersion: 1 }))
    expect(session.kind).toBe(type === 'accordbook-formula' ? 'formula' : 'paid')
    expect(worker).not.toHaveBeenCalled()
    session.dispose()
  })
  it.each(['onerror','onmessageerror'] as const)('fails closed and terminates on %s',async event=>{
    vi.stubGlobal('Worker',TestWorker)
    const execution=new WorkspaceExecution(),pending=execution.run({kind:'load',input:'{}'})
    TestWorker.latest[event]!()
    await expect(pending).rejects.toMatchObject({code:'atomic-commit-failed'})
    expect(TestWorker.latest.terminate).toHaveBeenCalledOnce()
    await expect(execution.run({kind:'load',input:'{}'})).rejects.toThrow()
  })
  it('disposal rejects pending work and ignores late replies',async()=>{
    vi.stubGlobal('Worker',TestWorker)
    const execution=new WorkspaceExecution(),pending=execution.run({kind:'load',input:'{}'}),worker=TestWorker.latest
    execution.dispose();worker.onmessage!({data:{id:1,result:{kind:'workspace'}}})
    await expect(pending).rejects.toThrow();execution.dispose();expect(worker.terminate).toHaveBeenCalledOnce()
  })
  it.each([
    [{name:'WorkspaceValidationError',path:'$.formula',reason:'missing parent'},WorkspaceValidationError],
    [{name:'WorkspaceUiError',code:'version'},WorkspaceUiError],
  ] as const)('restores stable error categories across the worker boundary (%j)',async(error,kind)=>{
    vi.stubGlobal('Worker',TestWorker)
    const execution=new WorkspaceExecution(),pending=execution.run({kind:'load',input:'{}'})
    TestWorker.latest.onmessage!({data:{id:1,error}})
    await expect(pending).rejects.toBeInstanceOf(kind);execution.dispose()
  })
  it('worker startup failure cannot append or allocate a sequence',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    vi.stubGlobal('Worker',class {constructor(){throw Error('Worker blocked')}})
    const storage=await createStorage(),before=await storage.exportData(),{file}=await engineFixture()
    expect(await importWorkspace(storage,file)).toEqual({ok:false,code:'atomic-commit-failed'})
    expect(await storage.exportData()).toEqual(before)
  })
})
