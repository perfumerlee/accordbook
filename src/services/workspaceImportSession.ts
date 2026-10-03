import type { WorkspaceFile } from '../models/workspaceFile'
import type { WorkspaceAppend } from '../storage/workspaceRepository'
import { WorkspaceExecution } from './workspaceExecution'
import { parseAccordbookEnvelope } from './workspaceUi'

/** Validated graph stays private for one import, including bounded CAS retries. */
export class WorkspaceImportSession {
  private constructor(private readonly execution: WorkspaceExecution | undefined, readonly kind: 'workspace' | 'formula' | 'paid', readonly sourceDisplayId?: string) {}
  static async open(input: WorkspaceFile | string): Promise<WorkspaceImportSession> {
    if (typeof input === 'string') {
      const envelope = parseAccordbookEnvelope(input)
      if (envelope.kind !== 'workspace') return new WorkspaceImportSession(undefined, envelope.kind)
      // This cast supplies no trust: the Worker validates the entire external object.
      input = envelope.raw as WorkspaceFile
    }
    const execution = new WorkspaceExecution()
    try {
      const info = await execution.run({ kind: 'load', input }) as { kind: 'workspace' | 'formula' | 'paid'; sourceDisplayId?: string }
      if (info.kind !== 'workspace') execution.dispose()
      return new WorkspaceImportSession(execution, info.kind, info.sourceDisplayId)
    } catch (error) { execution.dispose(); throw error }
  }
  async prepare(displayId: string, importedAt: string, metaUpdate: WorkspaceAppend['metaUpdate']): Promise<WorkspaceAppend> {
    if (!this.execution) throw new Error('Not a Workspace import session')
    return await this.execution.run({ kind: 'remap', displayId, importedAt, metaUpdate }) as WorkspaceAppend
  }
  dispose(): void { this.execution?.dispose() }
}
