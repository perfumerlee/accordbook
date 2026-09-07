import type { Formula, FormulaVersion } from '../models/formula'

export function getReleasedVersion(formula: Formula, versions: FormulaVersion[]): FormulaVersion | undefined {
  return versions.find(version => version.versionId === formula.releasedVersionId && version.parentFormulaId === formula.id && version.kind === 'manual')
}

export function validateReleaseTarget(formula: Formula, version: FormulaVersion | undefined): asserts version is FormulaVersion {
  if (!version || version.parentFormulaId !== formula.id || version.kind !== 'manual') {
    throw new Error('Release requires a saved manual version belonging to this formula.')
  }
}
