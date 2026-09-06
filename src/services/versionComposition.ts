import type { FormulaVersion, FormulaVersionSnapshot } from '../models/formula'

export const canShowVersionComposition = (version: FormulaVersion) => version.kind === 'manual'

export function getVersionComposition(snapshot: FormulaVersionSnapshot): string[] {
  const names = [...new Set(snapshot.rows.map(row => row.material.trim()).filter(Boolean))]
  return names.sort((a, b) => a.localeCompare(b, 'en') || (a < b ? -1 : a > b ? 1 : 0))
}
