import type { WorkspaceFile } from '../models/workspaceFile'
import { validateWorkspaceFile, WORKSPACE_LIMITS, WorkspaceValidationError } from './workspaceValidation'

// Parsing deliberately has no storage dependency, dispatch to legacy contracts, or ID generation.
export function parseWorkspaceFile(text: string): WorkspaceFile {
  if (new TextEncoder().encode(text).byteLength > WORKSPACE_LIMITS.maxFileBytes) throw new WorkspaceValidationError('$', 'file byte limit exceeded')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new WorkspaceValidationError('$', 'invalid JSON') }
  return validateWorkspaceFile(value)
}
