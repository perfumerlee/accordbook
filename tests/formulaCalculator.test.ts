import { describe, expect, it } from 'vitest'
import type { FormulaMaterial } from '../src/models/formula'
import { calculateBatchWeight, calculateFormulaTotals, calculatePercent } from '../src/services/formulaCalculator'

const row = (material: string, parts: number, dilution?: FormulaMaterial['dilution']): FormulaMaterial => ({ id: material, material, parts, dilution })

describe('formula calculation engine', () => {
  it('converts 1,000 parts to a complete 10.00 g batch', () => {
    const result = calculateFormulaTotals([row('A', 400), row('B', 150), row('C', 450)])
    expect(result.totalParts).toBe(1000)
    expect(result.batchWeightGrams).toBe(10)
    expect(result.complete).toBe(true)
  })

  it('calculates percent and batch weight', () => {
    expect(calculatePercent(400)).toBe(40)
    expect(calculatePercent(15)).toBe(1.5)
    expect(calculateBatchWeight(1)).toBe(0.01)
  })

  it('calculates diluted active and solvent contributions', () => {
    const result = calculateFormulaTotals([row('Indole', 15, { enabled: true, percent: 10, solvent: 'ALC' })])
    expect(result.concentratePercent).toBe(10)
    expect(result.solventPercent).toBe(90)
  })

  it('counts direct solvents and mixed concentrate correctly', () => {
    const result = calculateFormulaTotals([row('Aromatic', 900), row('DPG', 100)])
    expect(result.concentratePercent).toBe(90)
    expect(result.solventPercent).toBe(10)
  })
})
