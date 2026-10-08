import { validateWorkspaceFile, WORKSPACE_LIMITS, WorkspaceValidationError } from './workspaceValidation'
import type { WorkspaceMessageKey } from '../i18n/workspaceMessages'
import type { WorkspacePreparationResult } from './workspaceExportCoordinator'
import { profileWorkspace } from './workspaceProfile'

export class WorkspaceUiError extends Error {
  constructor(readonly code: WorkspaceMessageKey) { super(code); this.name = 'WorkspaceUiError' }
}
/** Route legacy/protected packages without depending on Workspace Worker availability. */
export function parseAccordbookEnvelope(text: string) {
  if (new TextEncoder().encode(text).byteLength > WORKSPACE_LIMITS.maxFileBytes) throw new WorkspaceUiError('size')
  let raw: { type?: string; formatVersion?: number } | null
  try { raw = profileWorkspace('json-parse', () => JSON.parse(text)) } catch { throw new WorkspaceUiError('damaged') }
  if (raw?.type === 'accordbook-workspace') {
    if (raw.formatVersion !== 1 && raw.formatVersion !== 2) throw new WorkspaceUiError('version')
    return { kind: 'workspace' as const, raw }
  }
  if (raw?.type === 'accordbook-formula' || raw?.type === 'accordbook-paid-package') {
    if (new TextEncoder().encode(text).byteLength > 16_000_000) throw new WorkspaceUiError('size')
    if (raw.type === 'accordbook-formula') return { kind: 'formula' as const }
    return { kind: 'paid' as const }
  }
  throw new WorkspaceUiError('unsupported')
}
export function parseAccordbookInput(text: string) {
  const envelope = parseAccordbookEnvelope(text)
  if (envelope.kind !== 'workspace') return envelope
  try { return { kind: 'workspace' as const, file: validateWorkspaceFile(envelope.raw) } }
  catch (error) { throw new WorkspaceUiError(validationMessage(error)) }
}
export function validationMessage(error: unknown): WorkspaceMessageKey {
  if (!(error instanceof WorkspaceValidationError)) return 'damaged'
  if (/limit|excessive/.test(error.reason)) return 'size'
  if (/missing|cycle|owner|reference|parent|purpose|identity|version number/.test(error.reason)) return 'history'
  if (/chain|integrity/.test(error.reason)) return 'integrity'
  return 'damaged'
}
export function preparationMessage(result: Extract<WorkspacePreparationResult, { ready: false }>): WorkspaceMessageKey {
  switch (result.reason) {
    case 'unsaved-experiment-draft': return 'evaluation'
    case 'unsaved-branch-intent': return 'branch'
    case 'unfinished-version-draft': return 'versionDraft'
    case 'unfinished-structural-edit': return 'structural'
    case 'busy': case 'session-changed': return 'busy'
    case 'formula-not-found': case 'editor-unavailable': return 'unavailable'
    case 'invalid-workspace-graph': return 'history'
    default: return 'storage'
  }
}
const importErrors: Record<string, WorkspaceMessageKey> = {
  'invalid-workspace': 'damaged', 'invalid-provenance': 'integrity',
  'identity-allocation-failed': 'allocation', 'concurrent-allocation': 'concurrent',
  'atomic-commit-failed': 'storage',
}
export const importErrorMessage = (code: string): WorkspaceMessageKey => importErrors[code] ?? 'unknown'

export function workspaceFilename(name: string): string {
  const safe = name.trim().toLowerCase().replace(/[\\/:*?"<>|]+/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/g, '')
  return `accordbook-${safe || 'formula'}.accordbook`
}
export function downloadWorkspace(serialized: string, name: string): void {
  const url = profileWorkspace('blob-create', () => URL.createObjectURL(new Blob([serialized], { type: 'application/vnd.accordbook' })))
  const link = document.createElement('a')
  try { link.href = url; link.download = workspaceFilename(name); document.body.append(link); link.click() }
  finally { link.remove(); URL.revokeObjectURL(url) }
}
