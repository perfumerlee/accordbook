import type { WorkspaceFile } from '../models/workspaceFile'
import type { WorkspaceAppend } from '../storage/workspaceRepository'
import { toWorkspaceFile, type WorkspaceSource } from './workspaceExport'
import { validateWorkspaceFile, validateWorkspaceGraph, assertWorkspaceProvenanceShape, WORKSPACE_LIMITS } from './workspaceValidation'
import { verifyValidatedWorkspaceProvenance } from './workspaceProvenance'
import { remapValidatedWorkspace } from './workspaceIdRemapping'
import { appendRevision } from './provenance'
import { parseAccordbookInput, WorkspaceUiError, validationMessage } from './workspaceUi'
import { profileWorkspace, profileWorkspaceAsync } from './workspaceProfile'

export type WorkspaceTask = { kind: 'load'; input: WorkspaceFile | string }
  | { kind: 'remap'; displayId: string; importedAt: string; metaUpdate: WorkspaceAppend['metaUpdate'] }
  | { kind: 'export'; source: WorkspaceSource }
export class WorkspacePipelineError extends Error {
  constructor(readonly code: string) { super(code) }
}
/** Private per-operation state. Neither untrusted input nor a mutable validated DTO is cached globally. */
export function createWorkspaceProcessor() {
  let file: WorkspaceFile | undefined
  return async (task: WorkspaceTask): Promise<unknown> => {
    if (task.kind === 'export') {
      const dto = profileWorkspace('export-dto', () => toWorkspaceFile(task.source))
      await profileWorkspaceAsync('export-provenance', () => verifyValidatedWorkspaceProvenance(dto))
      return profileWorkspace('serialization', () => JSON.stringify(dto))
    }
    if (task.kind === 'load') {
      file = undefined
      if (typeof task.input === 'string') {
        const parsed = parseAccordbookInput(task.input)
        if (parsed.kind !== 'workspace') return { kind: parsed.kind }
        file = parsed.file
      } else {
        try { file = validateWorkspaceFile(task.input) }
        catch (error) { throw new WorkspaceUiError(validationMessage(error)) }
      }
      try { await profileWorkspaceAsync('import-provenance', () => verifyValidatedWorkspaceProvenance(file!)) }
      catch { file = undefined; throw new WorkspacePipelineError('invalid-provenance') }
      return { kind: 'workspace', sourceDisplayId: file.formula.formulaId }
    }
    if (!file) throw new WorkspacePipelineError('invalid-workspace')
    const { records } = profileWorkspace('remap', () => remapValidatedWorkspace(file!, task.displayId, task.importedAt))
    records.formula = await appendRevision(records.formula, 'imported')
    if (records.formula.provenance) assertWorkspaceProvenanceShape(records.formula.provenance)
    const result = { ...file, ...records }
    profileWorkspace('final-graph', () => validateWorkspaceGraph(result))
    // Crypto still verifies the newly appended revision and full historical chain.
    await profileWorkspaceAsync('final-provenance', () => verifyValidatedWorkspaceProvenance(result))
    // Remapped UUIDs and the new revision may push a valid input over the transport cap.
    const { workspaceImport: _import, ...formula } = records.formula
    const external = { ...result, formula: { ...formula, rows: formula.rows.map(({ id: _id, ...row }) => row) } }
    if (new TextEncoder().encode(JSON.stringify(external)).byteLength > WORKSPACE_LIMITS.maxFileBytes) throw new WorkspacePipelineError('invalid-workspace')
    const prepared = { ...records, metaUpdate: task.metaUpdate ? { ...task.metaUpdate } : undefined, checkDisplayId: true } satisfies WorkspaceAppend
    return prepared
  }
}
