import type { WorkspaceAppend } from '../storage/workspaceRepository'
import { createWorkspaceProcessor, WorkspacePipelineError, type WorkspaceTask } from './workspacePipeline'
import { WorkspaceValidationError } from './workspaceValidation'
import { WorkspaceUiError } from './workspaceUi'
import type { WorkspaceMessageKey } from '../i18n/workspaceMessages'
import { profileWorkspace, workspaceProfileEnabled, reportWorkspaceProfile } from './workspaceProfile'

const preparedAppends = new WeakSet<object>()
function seal(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) seal(child)
  Object.freeze(value)
}
/** Only a response from this module's validating processor can receive the one-use capability. */
export function consumePreparedWorkspaceAppend(value: WorkspaceAppend): boolean { return preparedAppends.delete(value) }
type Failure = { name: string; code?: string; path?: string; reason?: string }
export type WorkspaceWorkerResponse = { id: number; result?: unknown; error?: Failure; timings?: { stage: string; ms: number }[] }
function restoreError(error: Failure): Error {
  if (error.name === 'WorkspaceValidationError') return new WorkspaceValidationError(error.path ?? '$', error.reason ?? 'invalid workspace')
  if (error.name === 'WorkspaceUiError') return new WorkspaceUiError(error.code as WorkspaceMessageKey)
  return new WorkspacePipelineError(error.code ?? 'atomic-commit-failed')
}
/** One local worker per operation. IDB and UI never cross this boundary. */
export class WorkspaceExecution {
  private worker?: Worker
  private process?: ReturnType<typeof createWorkspaceProcessor>
  private nextId = 0
  private disposed = false
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private pageHide = () => this.dispose()
  constructor(mode: 'auto' | 'main' = 'auto') {
    if (mode === 'main' || typeof Worker === 'undefined') this.process = createWorkspaceProcessor()
    else {
      try { this.worker = new Worker(new URL('./workspace.worker.ts', import.meta.url), { type: 'module' }) }
      catch { throw new WorkspacePipelineError('atomic-commit-failed') }
      this.worker.onmessage = (event: MessageEvent<WorkspaceWorkerResponse>) => {
        const entry = this.pending.get(event.data.id)
        if (!entry) return
        this.pending.delete(event.data.id); clearTimeout(entry.timer)
        for (const timing of event.data.timings ?? []) reportWorkspaceProfile(timing.stage, timing.ms)
        if (event.data.error) entry.reject(restoreError(event.data.error)); else entry.resolve(event.data.result)
      }
      this.worker.onerror = () => this.dispose()
      this.worker.onmessageerror = () => this.dispose()
      if (typeof window !== 'undefined') window.addEventListener('pagehide', this.pageHide)
    }
  }
  async run(task: WorkspaceTask): Promise<unknown> {
    if (this.disposed) throw new WorkspacePipelineError('atomic-commit-failed')
    const result = this.process ? await this.process(task) : await new Promise<unknown>((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => this.dispose(), 120_000)
      this.pending.set(id, { resolve, reject, timer })
      try { profileWorkspace('worker-send', () => this.worker!.postMessage({ id, task, profile: workspaceProfileEnabled() })) }
      catch { this.dispose() }
    })
    if (this.disposed) throw new WorkspacePipelineError('atomic-commit-failed')
    if (task.kind === 'remap') {
      profileWorkspace('seal-owned-records', () => seal(result))
      preparedAppends.add(result as object)
    }
    return result
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.worker?.terminate(); this.process = undefined
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.pageHide)
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new WorkspacePipelineError('atomic-commit-failed')) }
    this.pending.clear()
  }
}
