import type { AccordbookStorage } from '../storage/storageService'
import type { WorkspaceSource } from './workspaceExport'
import { WorkspaceExecution } from './workspaceExecution'
import { WorkspaceValidationError } from './workspaceValidation'
import { profileWorkspaceAsync } from './workspaceProfile'

export type WorkspaceCollectionResult = { ok: true; workspace: WorkspaceSource; serialized: string } | {
  ok: false; code: 'formula-not-found' | 'invalid-workspace-graph' | 'storage-read-failed'; diagnostic?: { path: string; reason: string }
}
/** Only domain records leave this boundary. The DTO projection is used for validation, not returned. */
export async function collectWorkspace(storage: AccordbookStorage, formulaId: string): Promise<WorkspaceCollectionResult> {
  try {
    const source = await profileWorkspaceAsync('coherent-read', () => storage.workspaces.readWorkspace(formulaId))
    if (!source) return { ok: false, code: 'formula-not-found' }
    if (source.formula.id !== formulaId) return { ok: false, code: 'invalid-workspace-graph', diagnostic: { path: '$.formula.id', reason: 'wrong Formula owner' } }
    const execution = new WorkspaceExecution()
    let serialized: string
    try { serialized = await execution.run({ kind: 'export', source }) as string }
    finally { execution.dispose() }
    // Storage read already owns this isolated snapshot in both IndexedDB and memory modes.
    return { ok: true, workspace: source, serialized }
  } catch (error) {
    if (error instanceof WorkspaceValidationError) return { ok: false, code: 'invalid-workspace-graph', diagnostic: { path: error.path, reason: error.reason } }
    return { ok: false, code: 'storage-read-failed' }
  }
}
