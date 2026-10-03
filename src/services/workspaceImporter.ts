import type { AccordbookStorage } from '../storage/storageService'
import type { WorkspaceFile } from '../models/workspaceFile'
import { WorkspaceAppendConflict } from '../storage/workspaceRepository'
import { WorkspaceImportSession } from './workspaceImportSession'
import { WorkspacePipelineError } from './workspacePipeline'
import { proposeWorkspaceDisplayId } from './workspaceDisplayId'
import { profileWorkspaceAsync } from './workspaceProfile'

export type WorkspaceImportResult = { ok: true; formulaId: string; displayFormulaId: string; versionCount: number; experimentCount: number; variantCount: number; branchCount: number; evaluationCount: number; persistence: 'indexeddb' | 'memory' }
  | { ok: false; code: 'invalid-workspace' | 'invalid-provenance' | 'identity-allocation-failed' | 'concurrent-allocation' | 'atomic-commit-failed' }
export const WORKSPACE_IMPORT_ATTEMPTS = 4

export async function importWorkspace(storage: AccordbookStorage, input: WorkspaceFile | WorkspaceImportSession, options: { now?: Date } = {}): Promise<WorkspaceImportResult> {
  let session: WorkspaceImportSession
  try { session = input instanceof WorkspaceImportSession ? input : await WorkspaceImportSession.open(input) }
  catch (error) { return { ok: false, code: error instanceof WorkspacePipelineError && error.code === 'invalid-provenance' ? 'invalid-provenance' : error instanceof WorkspacePipelineError && error.code === 'atomic-commit-failed' ? 'atomic-commit-failed' : 'invalid-workspace' } }
  try {
  if (session.kind !== 'workspace') return { ok: false, code: 'invalid-workspace' }
  const date = options.now ? new Date(options.now) : new Date()
  if (!Number.isFinite(date.getTime())) return { ok: false, code: 'identity-allocation-failed' }
  for (let attempt = 0; attempt < WORKSPACE_IMPORT_ATTEMPTS; attempt++) {
    let proposal: Awaited<ReturnType<typeof proposeWorkspaceDisplayId>>
    try { proposal = await proposeWorkspaceDisplayId(storage, date, session.sourceDisplayId) } catch { return { ok: false, code: 'identity-allocation-failed' } }
    try {
      const records = await session.prepare(proposal.displayFormulaId, date.toISOString(), proposal.metaUpdate)
      await profileWorkspaceAsync('atomic-append', () => storage.workspaces.appendWorkspaceAtomic(records))
      const variants = records.experiments.flatMap(e => e.variants)
      return { ok: true, formulaId: records.formula.id, displayFormulaId: records.formula.formulaId,
        versionCount: records.versions.length, experimentCount: records.experiments.length, variantCount: variants.length,
        branchCount: variants.filter(v => v.parentVariantId !== null).length,
        evaluationCount: variants.reduce((n, v) => n + (v.evaluations?.length ?? 0), 0), persistence: storage.mode }
    } catch (error) {
      if (error instanceof WorkspaceAppendConflict) continue
      return { ok: false, code: 'atomic-commit-failed' }
    }
  }
  return { ok: false, code: 'concurrent-allocation' }
  } finally { session.dispose() }
}
