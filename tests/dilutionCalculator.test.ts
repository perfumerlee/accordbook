import { describe, expect, it } from 'vitest'
import { calculateDilution } from '../src/services/dilutionCalculator'

describe('dilution calculation', () => {
  it('calculates 15 parts at 10% in solvent', () => {
    const result = calculateDilution({ id: 'indole', material: 'Indole', parts: 15, dilution: { enabled: true, percent: 10, solvent: 'ALC' } })
    expect(result.solutionGrams).toBeCloseTo(0.15)
    expect(result.activeGrams).toBeCloseTo(0.015)
    expect(result.solventGrams).toBeCloseTo(0.135)
  })
})
