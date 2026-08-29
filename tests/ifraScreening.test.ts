import { describe, expect, it } from 'vitest'
import type { FormulaMaterial } from '../src/models/formula'
import type { IfraMaterial } from '../src/models/ifra'
import type { NaturalContributionEntry } from '../src/models/naturalContribution'
import { calculateAllergenLabeling, calculateMaxUsagePercent } from '../src/services/ifraScreening'

const row = (overrides: Partial<FormulaMaterial>): FormulaMaterial => ({ id: crypto.randomUUID(), parts: '', material: '', ...overrides })
const ifra = (overrides: Partial<IfraMaterial>): IfraMaterial => ({ cas: '', name: '', limits: {}, ...overrides })
const contribution = (overrides: Partial<NaturalContributionEntry>): NaturalContributionEntry => ({ ncsCas: '', ncsName: '', constituentCas: '', constituentName: '', percent: 0, ...overrides })

describe('calculateMaxUsagePercent', () => {
  it('picks the most restrictive material (min of limit/fraction)', () => {
    const rows = [
      row({ parts: 500, material: 'A', cas: 'CAS-A' }),
      row({ parts: 500, material: 'B', cas: 'CAS-B' }),
    ]
    const materials = [
      ifra({ cas: 'CAS-A', limits: { cat4: 5 } }),
      ifra({ cas: 'CAS-B', limits: { cat4: 2 } }),
    ]
    const result = calculateMaxUsagePercent(rows, materials, 'cat4')
    expect(result.max).toBeCloseTo(4)
    expect(result.limitingRowId).toBe(rows[1].id)
  })

  it('excludes solvent parts when computing concentrate fraction', () => {
    const rows = [
      row({ parts: 500, material: 'ALC' }),
      row({ parts: 500, material: 'A', cas: 'CAS-A' }),
    ]
    const materials = [ifra({ cas: 'CAS-A', limits: { cat4: 10 } })]
    const result = calculateMaxUsagePercent(rows, materials, 'cat4')
    expect(result.max).toBeCloseTo(10)
  })

  it('reports unmatched and no-data rows without letting them affect the result', () => {
    const rows = [
      row({ parts: 900, material: 'Unknown', cas: 'CAS-UNKNOWN' }),
      row({ parts: 50, material: 'NoCasRow' }),
      row({ parts: 50, material: 'A', cas: 'CAS-A' }),
    ]
    const materials = [ifra({ cas: 'CAS-A', limits: { cat4: 1 } })]
    const result = calculateMaxUsagePercent(rows, materials, 'cat4')
    expect(result.unmatchedCount).toBe(2)
    expect(result.noDataCount).toBe(0)
    expect(result.max).toBeCloseTo(1 / 0.05)
  })

  it('returns null when no material has usable data', () => {
    const rows = [row({ parts: 500, material: 'Unknown', cas: 'CAS-UNKNOWN' })]
    const result = calculateMaxUsagePercent(rows, [], 'cat4')
    expect(result.max).toBeNull()
    expect(result.unmatchedCount).toBe(1)
  })
})

describe('calculateAllergenLabeling', () => {
  it('flags a 26-list allergen that crosses the leave-on threshold (0.001%) at the given usage level', () => {
    const rows = [row({ parts: 1000, material: 'A', cas: 'CAS-A' })]
    const materials = [ifra({ cas: 'CAS-A', name: 'A', allergen26: true })]
    // 1000 parts, no solvent => fraction 1; at 1% usage, concentration = 1%, well above 0.001%.
    const result = calculateAllergenLabeling(rows, materials, [], 1, 'leave-on', 'allergen26')
    expect(result.required.map((e) => e.name)).toEqual(['A'])
    expect(result.undetermined).toEqual([])
  })

  it('does not flag when concentration stays below the threshold', () => {
    const rows = [row({ parts: 10, material: 'A', cas: 'CAS-A' })]
    const materials = [ifra({ cas: 'CAS-A', name: 'A', allergen26: true })]
    // fraction = 10/10 = 1; at 0.0001% usage, concentration = 0.0001%, below leave-on 0.001%.
    const result = calculateAllergenLabeling(rows, materials, [], 0.0001, 'leave-on', 'allergen26')
    expect(result.required).toEqual([])
  })

  it('uses the rinse-off threshold (0.01%) instead of leave-on when asked', () => {
    const rows = [row({ parts: 1000, material: 'A', cas: 'CAS-A' })]
    const materials = [ifra({ cas: 'CAS-A', name: 'A', allergen83: true })]
    expect(calculateAllergenLabeling(rows, materials, [], 0.005, 'rinse-off', 'allergen83').required).toEqual([])
    expect(calculateAllergenLabeling(rows, materials, [], 0.02, 'rinse-off', 'allergen83').required).toHaveLength(1)
  })

  it('checks the 26 and 83 lists independently', () => {
    const rows = [
      row({ parts: 500, material: 'A', cas: 'CAS-A' }),
      row({ parts: 500, material: 'B', cas: 'CAS-B' }),
    ]
    const materials = [
      ifra({ cas: 'CAS-A', name: 'A', allergen26: true, allergen83: false }),
      ifra({ cas: 'CAS-B', name: 'B', allergen26: false, allergen83: true }),
    ]
    const result26 = calculateAllergenLabeling(rows, materials, [], 1, 'leave-on', 'allergen26')
    const result83 = calculateAllergenLabeling(rows, materials, [], 1, 'leave-on', 'allergen83')
    expect(result26.required.map((e) => e.name)).toEqual(['A'])
    expect(result83.required.map((e) => e.name)).toEqual(['B'])
  })

  it('treats a missing usage percent as undetermined, not "safe"', () => {
    const rows = [row({ parts: 1000, material: 'A', cas: 'CAS-A' })]
    const materials = [ifra({ cas: 'CAS-A', name: 'A', allergen26: true })]
    expect(calculateAllergenLabeling(rows, materials, [], null, 'leave-on', 'allergen26').undetermined).toHaveLength(1)
  })

  it('ignores non-allergen and unmatched materials', () => {
    const rows = [
      row({ parts: 500, material: 'A', cas: 'CAS-A' }),
      row({ parts: 500, material: 'B', cas: 'CAS-UNKNOWN' }),
    ]
    const materials = [ifra({ cas: 'CAS-A', name: 'A', allergen26: false })]
    const result = calculateAllergenLabeling(rows, materials, [], 10, 'leave-on', 'allergen26')
    expect(result.required).toEqual([])
    expect(result.undetermined).toEqual([])
  })

  it('uses the regulation-mandated declared name instead of the row material name when present', () => {
    const rows = [row({ parts: 1000, material: 'Geranial (natural)', cas: 'CAS-GERANIAL' })]
    const materials = [ifra({ cas: 'CAS-GERANIAL', name: 'Geranial', declaredName: 'Citral', allergen26: true })]
    const result = calculateAllergenLabeling(rows, materials, [], 1, 'leave-on', 'allergen26')
    expect(result.required.map((e) => e.name)).toEqual(['Citral'])
  })

  it('adds the natural-contribution trace of an allergen from an essential oil to the total', () => {
    // Lavender oil (not itself an allergen) naturally contains 3% Linalool (an allergen).
    const rows = [row({ parts: 1000, material: 'Lavender oil', cas: 'CAS-LAVENDER' })]
    const materials = [
      ifra({ cas: 'CAS-LAVENDER', name: 'Lavender oil' }),
      ifra({ cas: 'CAS-LINALOOL', name: 'Linalool', allergen26: true }),
    ]
    const contributions = [contribution({ ncsCas: 'CAS-LAVENDER', constituentCas: 'CAS-LINALOOL', constituentName: 'Linalool', percent: 3 })]
    // fraction = 1; at 1% usage, Lavender oil concentration = 1%, so Linalool contribution = 1% * 3% = 0.03%, above 0.001%.
    const result = calculateAllergenLabeling(rows, materials, contributions, 1, 'leave-on', 'allergen26')
    expect(result.required).toHaveLength(1)
    expect(result.required[0].name).toBe('Linalool')
    expect(result.required[0].totalConcentration).toBeCloseTo(0.03)
    expect(result.required[0].naturalConcentration).toBeCloseTo(0.03)
  })

  it('combines direct addition and natural contribution of the same substance into one total', () => {
    // Pure Linalool added directly, plus more Linalool naturally present in Lavender oil.
    const rows = [
      row({ parts: 500, material: 'Linalool', cas: 'CAS-LINALOOL' }),
      row({ parts: 500, material: 'Lavender oil', cas: 'CAS-LAVENDER' }),
    ]
    const materials = [
      ifra({ cas: 'CAS-LINALOOL', name: 'Linalool', allergen26: true }),
      ifra({ cas: 'CAS-LAVENDER', name: 'Lavender oil' }),
    ]
    const contributions = [contribution({ ncsCas: 'CAS-LAVENDER', constituentCas: 'CAS-LINALOOL', constituentName: 'Linalool', percent: 10 })]
    // usage 10%: Linalool row concentration = 10% * 0.5 = 5%. Lavender row concentration = 10% * 0.5 = 5%,
    // contributing 5% * 10% = 0.5% Linalool naturally. Total = 5.5%.
    const result = calculateAllergenLabeling(rows, materials, contributions, 10, 'leave-on', 'allergen26')
    expect(result.required).toHaveLength(1)
    expect(result.required[0].totalConcentration).toBeCloseTo(5.5)
    expect(result.required[0].naturalConcentration).toBeCloseTo(0.5)
  })

  it('ignores a natural contribution whose constituent is not flagged for the requested allergen list', () => {
    const rows = [row({ parts: 1000, material: 'Lavender oil', cas: 'CAS-LAVENDER' })]
    const materials = [
      ifra({ cas: 'CAS-LAVENDER', name: 'Lavender oil' }),
      ifra({ cas: 'CAS-LINALOOL', name: 'Linalool', allergen26: false, allergen83: false }),
    ]
    const contributions = [contribution({ ncsCas: 'CAS-LAVENDER', constituentCas: 'CAS-LINALOOL', constituentName: 'Linalool', percent: 3 })]
    const result = calculateAllergenLabeling(rows, materials, contributions, 1, 'leave-on', 'allergen26')
    expect(result.required).toEqual([])
    expect(result.undetermined).toEqual([])
  })
})
