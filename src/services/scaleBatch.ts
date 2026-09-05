import type { FormulaSnapshotRow } from '../models/formula'
import { calculateTotalParts } from './formulaCalculator'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

export function isScaleBatchEligible(rows: FormulaSnapshotRow[]): boolean {
  return calculateTotalParts(rows.map(row => ({ ...row, id: row.rowId }))) === 1000
}

/** Read-only derived weights of the supplied version; dilution remains a single solution. */
export function calculateScaledBatch(rows: FormulaSnapshotRow[], batchAmount: number) {
  if (!Number.isFinite(batchAmount) || batchAmount <= 0 || !isScaleBatchEligible(rows)) return null
  return {
    totalGrams: batchAmount,
    rows: rows.filter(isMeaningfulFormulaRow).map(row => ({
      sourceRowId: row.rowId,
      material: row.material,
      parts: row.parts,
      dilution: row.dilution,
      grams: (typeof row.parts === 'number' ? row.parts : 0) / 1000 * batchAmount,
    })),
  }
}

export function formatBatchWeight(grams: number, language: 'en' | 'ko'): string {
  return new Intl.NumberFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 3,
  }).format(grams)
}
