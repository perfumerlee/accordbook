import type { Formula, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import type { AccordbookStorage } from '../storage/storageService'

export function getReleasedVersion(formula: Formula, versions: FormulaVersion[]): FormulaVersion | undefined {
  return versions.find(version => version.versionId === formula.releasedVersionId && version.parentFormulaId === formula.id && version.kind === 'manual')
}

export function validateReleaseTarget(formula: Formula, version: FormulaVersion | undefined): asserts version is FormulaVersion {
  if (!version || version.parentFormulaId !== formula.id || version.kind !== 'manual') {
    throw new Error('Release requires a saved manual version belonging to this formula.')
  }
}

export type LicensedFormulaExportSource =
  | { kind: 'released'; snapshot: FormulaVersionSnapshot; version: FormulaVersion }
  | { kind: 'working'; formula: Formula }

export async function resolveLicensedFormulaExportSource(formula: Formula, storage: AccordbookStorage): Promise<LicensedFormulaExportSource> {
  if (!formula.releasedVersionId) return { kind: 'working', formula }
  const versions = await storage.versions.listByParentFormulaId(formula.id)
  const released = getReleasedVersion(formula, versions)
  return released ? { kind: 'released', snapshot: released.snapshot, version: released } : { kind: 'working', formula }
}
