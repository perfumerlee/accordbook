import type { FormulaMaterial } from '../models/formula'
import type { IfraMaterial } from '../models/ifra'
import type { NaturalContributionEntry } from '../models/naturalContribution'
import { calculateDilution } from './dilutionCalculator'
import { calculateSolventParts, calculateTotalParts } from './formulaCalculator'
import { isSolventMaterial } from './solventClassifier'

export function matchIfraMaterial(row: FormulaMaterial, materials: IfraMaterial[]): IfraMaterial | undefined {
  const cas = row.cas?.trim()
  if (!cas) return undefined
  return materials.find((material) => material.cas === cas)
}

function concentrateActiveParts(row: FormulaMaterial): number {
  if (isSolventMaterial(row.material)) return 0
  return calculateDilution(row).activeParts
}

export function calculateConcentrateFraction(rows: FormulaMaterial[], rowId: string): number {
  const totalParts = calculateTotalParts(rows)
  const concentrateTotal = totalParts - calculateSolventParts(rows)
  if (concentrateTotal <= 0) return 0
  const row = rows.find((r) => r.id === rowId)
  if (!row) return 0
  return concentrateActiveParts(row) / concentrateTotal
}

export interface MaxUsageResult {
  max: number | null
  limitingRowId?: string
  unmatchedCount: number
  noDataCount: number
}

export function calculateMaxUsagePercent(rows: FormulaMaterial[], materials: IfraMaterial[], categoryKey: string): MaxUsageResult {
  let unmatchedCount = 0
  let noDataCount = 0
  let max: number | null = null
  let limitingRowId: string | undefined

  for (const row of rows) {
    if (typeof row.parts !== 'number' || row.parts <= 0) continue
    if (isSolventMaterial(row.material)) continue

    const matched = matchIfraMaterial(row, materials)
    if (!matched) { unmatchedCount += 1; continue }
    const limit = matched.limits[categoryKey]
    if (limit === undefined) { noDataCount += 1; continue }

    const fraction = calculateConcentrateFraction(rows, row.id)
    if (fraction <= 0) continue
    const candidate = limit / fraction

    if (max === null || candidate < max) { max = candidate; limitingRowId = row.id }
  }

  return { max, limitingRowId, unmatchedCount, noDataCount }
}

export type ProductType = 'leave-on' | 'rinse-off'
export type AllergenList = 'allergen26' | 'allergen83'

// EU Cosmetic Regulation (EC) No 1223/2009, Annex III (as amended): designated fragrance
// allergens must be declared on the label above these concentrations in the finished
// product, regardless of which allergen list (26 or the expanded 83) flags the material.
export const ALLERGEN_LABELING_THRESHOLD: Record<ProductType, number> = {
  'leave-on': 0.001,
  'rinse-off': 0.01,
}

export interface AllergenSubstance {
  name: string
  totalConcentration: number
  naturalConcentration: number
}

export interface AllergenEntry {
  name: string
}

export interface AllergenLabelingResult {
  required: AllergenSubstance[]
  undetermined: AllergenEntry[]
}

function registeredName(materials: IfraMaterial[], cas: string, fallback: string): string {
  const matched = materials.find((material) => material.cas === cas)
  return matched?.declaredName || matched?.name || fallback
}

// Aggregates each allergen substance's total concentration across the WHOLE formula --
// both added directly (a row IS the allergen) and contributed indirectly (a row is a
// natural raw material, e.g. an essential oil, that naturally contains the allergen as
// a trace constituent, per the IFRA "Annex on contributions from other sources"). Two
// materials each contributing a below-threshold trace of the same substance can still
// add up to a labeling requirement, so the two sources are combined before comparing
// against the threshold.
export function calculateAllergenLabeling(
  rows: FormulaMaterial[],
  materials: IfraMaterial[],
  naturalContributions: NaturalContributionEntry[],
  usagePercent: number | null,
  productType: ProductType,
  list: AllergenList,
): AllergenLabelingResult {
  const threshold = ALLERGEN_LABELING_THRESHOLD[productType]
  // Keyed by the resolved label name, not CAS -- several CAS numbers (e.g. Citral's
  // Geranial/Neral isomers) can share one mandated declared name, and must be summed
  // as a single labeled substance rather than reported as separate entries.
  const totals = new Map<string, { total: number; natural: number }>()
  const undetermined = new Set<string>()

  for (const row of rows) {
    if (typeof row.parts !== 'number' || row.parts <= 0) continue
    if (isSolventMaterial(row.material)) continue

    const matched = matchIfraMaterial(row, materials)
    const fraction = calculateConcentrateFraction(rows, row.id)
    const rowConcentration = usagePercent === null ? null : usagePercent * fraction

    if (matched && matched[list] === true) {
      const name = matched.declaredName || matched.name || row.material
      if (rowConcentration === null) {
        undetermined.add(name)
      } else {
        const entry = totals.get(name) ?? { total: 0, natural: 0 }
        entry.total += rowConcentration
        totals.set(name, entry)
      }
    }

    if (matched) {
      for (const contribution of naturalContributions) {
        if (contribution.ncsCas !== matched.cas) continue
        const constituentMaterial = materials.find((material) => material.cas === contribution.constituentCas)
        if (!constituentMaterial || constituentMaterial[list] !== true) continue

        const name = registeredName(materials, contribution.constituentCas, contribution.constituentName)
        if (rowConcentration === null) {
          undetermined.add(name)
        } else {
          const amount = rowConcentration * (contribution.percent / 100)
          const entry = totals.get(name) ?? { total: 0, natural: 0 }
          entry.total += amount
          entry.natural += amount
          totals.set(name, entry)
        }
      }
    }
  }

  const required: AllergenSubstance[] = []
  for (const [name, entry] of totals) {
    undetermined.delete(name)
    if (entry.total >= threshold) required.push({ name, totalConcentration: entry.total, naturalConcentration: entry.natural })
  }

  return { required, undetermined: [...undetermined].map((name) => ({ name })) }
}
