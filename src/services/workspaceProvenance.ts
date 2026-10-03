import type { Formula } from '../models/formula'
import type { WorkspaceFile } from '../models/workspaceFile'
import { contentFingerprint, sha256, verifyIntegrity } from './provenance'
import { validateWorkspaceFile, WorkspaceValidationError } from './workspaceValidation'

/** Historical hashes remain untouched; the composition hash does not replace graph validation. */
export async function verifyWorkspaceProvenance(input: WorkspaceFile): Promise<void> {
  return verifyValidatedWorkspaceProvenance(validateWorkspaceFile(input))
}
/** Internal pipeline only: shape/graph boundary must already have produced an owned DTO. */
export async function verifyValidatedWorkspaceProvenance(file: WorkspaceFile): Promise<void> {
  const p = file.formula.provenance
  if (!p) return // A workspace without historical provenance is a supported source.
  const formula: Formula = { ...file.formula, rows: file.formula.rows.map((row, i) => ({ ...row, id: `verification-${i}` })) }
  const valid = await verifyIntegrity(formula) === 'verified'
    && p.currentFingerprint === p.revisions[p.revisions.length - 1].contentFingerprint
    && p.currentFingerprint === await contentFingerprint(formula)
    && (!p.checkpoint || p.checkpoint.fingerprint.value === await sha256(p.checkpoint.formulaSnapshot))
  if (!valid) throw new WorkspaceValidationError('$.formula.provenance', 'historical integrity mismatch')
}
