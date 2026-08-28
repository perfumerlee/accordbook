import type { FormulaMaterial } from '../models/formula'
import { calculateDilution } from './dilutionCalculator'
import { isSolventMaterial } from './solventClassifier'

export interface FormulaTotals {
  totalParts: number
  batchWeightGrams: number
  concentratePercent: number
  solventPercent: number
  complete: boolean
  differenceParts: number
}

export function calculateTotalParts(rows: FormulaMaterial[]): number {
  return rows.reduce((total, row) => total + (typeof row.parts === 'number' ? row.parts : 0), 0)
}

export function calculatePercent(parts: number | ''): number {
  return typeof parts === 'number' ? parts / 10 : 0
}

export function calculateBatchWeight(parts: number | ''): number {
  return typeof parts === 'number' ? parts * 0.01 : 0
}

export function calculateSolventParts(rows: FormulaMaterial[]): number {
  return rows.reduce((total, row) => {
    const parts = typeof row.parts === 'number' ? row.parts : 0
    if (isSolventMaterial(row.material)) return total + parts
    return total + calculateDilution(row).solventParts
  }, 0)
}

export function calculateSolventShare(rows: FormulaMaterial[]): number {
  const totalParts = calculateTotalParts(rows)
  return totalParts === 0 ? 0 : (calculateSolventParts(rows) / totalParts) * 100
}

export function calculateFormulaStrength(rows: FormulaMaterial[]): number {
  const totalParts = calculateTotalParts(rows)
  if (totalParts === 0) return 0
  const solventParts = calculateSolventParts(rows)
  return ((totalParts - solventParts) / totalParts) * 100
}

export function calculateFormulaTotals(rows: FormulaMaterial[]): FormulaTotals {
  const totalParts = calculateTotalParts(rows)
  return {
    totalParts,
    batchWeightGrams: calculateBatchWeight(totalParts),
    concentratePercent: calculateFormulaStrength(rows),
    solventPercent: calculateSolventShare(rows),
    complete: totalParts === 1000,
    differenceParts: 1000 - totalParts,
  }
}
