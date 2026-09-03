import type { FormulaSnapshotRow } from '../models/formula'

const normalized = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** A row is composition data when it contains any user-entered meaning. */
export function isMeaningfulFormulaRow(row: FormulaSnapshotRow): boolean {
  if (normalized(row.material)) return true
  if (normalized(row.cas)) return true
  if (row.dilution?.enabled) return true
  const parts = row.parts === '' ? 0 : Number(row.parts)
  return Number.isFinite(parts) && parts !== 0
}
