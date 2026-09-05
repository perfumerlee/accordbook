import type { Formula } from '../models/formula'

const normalize = (value: string) => value.trim().toLocaleLowerCase()

export function collectMaterialCandidates(formulas: readonly Formula[], archive: readonly Formula[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const formula of [...formulas, ...archive]) {
    for (const row of formula.rows) {
      const value = row.material.trim()
      const key = normalize(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(value)
    }
  }
  return result
}

export function filterMaterialSuggestions(candidates: readonly string[], query: string, maxResults = 5): string[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery || maxResults <= 0) return []
  const prefix: string[] = []
  const contains: string[] = []
  for (const candidate of candidates) {
    const normalized = normalize(candidate)
    if (!normalized || normalized === normalizedQuery) continue
    if (normalized.startsWith(normalizedQuery)) prefix.push(candidate)
    else if (normalized.includes(normalizedQuery)) contains.push(candidate)
  }
  return [...prefix, ...contains].slice(0, maxResults)
}
