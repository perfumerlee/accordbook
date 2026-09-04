import type { Formula } from '../models/formula'

export function matchesFormulaSearch(formula: Formula, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return formula.name.toLowerCase().includes(normalized) || formula.formulaId.toLowerCase().includes(normalized)
}

export function filterFormulasByQuery(formulas: Formula[], query: string): Formula[] {
  return formulas.filter((formula) => matchesFormulaSearch(formula, query))
}
