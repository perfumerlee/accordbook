import type { FormulaMaterial } from '../models/formula'

export interface DilutionResult {
  solutionGrams: number
  activeGrams: number
  solventGrams: number
  activeParts: number
  solventParts: number
}

export function calculateDilution(row: FormulaMaterial): DilutionResult {
  const parts = typeof row.parts === 'number' ? row.parts : 0
  const dilution = row.dilution
  const percent = dilution?.enabled ? dilution.percent : 100
  const activeRatio = Math.max(0, Math.min(100, percent)) / 100
  const solutionGrams = calculateBatchWeight(parts)

  return {
    solutionGrams,
    activeGrams: solutionGrams * activeRatio,
    solventGrams: solutionGrams * (1 - activeRatio),
    activeParts: parts * activeRatio,
    solventParts: parts * (1 - activeRatio),
  }
}

function calculateBatchWeight(parts: number): number {
  return parts * 0.01
}
