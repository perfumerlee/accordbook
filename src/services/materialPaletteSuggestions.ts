import type { MaterialPaletteRecord } from '../models/materialPalette'
import { normalizeMaterialName } from './materialIdentity'
import { filterMaterialSuggestions } from './materialMemory'

export type PaletteCasLookup =
  | { status: 'matched'; cas: string }
  | { status: 'ambiguous'; candidates: MaterialPaletteRecord[] }
  | { status: 'none' }

/** Exact material-name matches take priority over aliases; ambiguous identities are never auto-filled. */
export function lookupPaletteCas(palette: readonly MaterialPaletteRecord[], query: string): PaletteCasLookup {
  const key = normalizeMaterialName(query)
  if (!key) return { status: 'none' }
  const exact = palette.filter(item => normalizeMaterialName(item.materialName) === key)
  const matches = exact.length ? exact : palette.filter(item => normalizeMaterialName(item.alias ?? '') === key)
  if (matches.length > 1) return { status: 'ambiguous', candidates: [...matches] }
  const cas = matches[0]?.cas?.trim()
  return cas ? { status: 'matched', cas } : { status: 'none' }
}

export function filterPaletteMaterialSuggestions(palette: readonly MaterialPaletteRecord[], memory: readonly string[], query: string, limit = 5): string[] {
  const key = normalizeMaterialName(query)
  if (!key || limit <= 0) return []
  const prefix: string[] = [], contains: string[] = [], seen = new Set<string>()
  for (const item of palette) {
    const name = normalizeMaterialName(item.materialName), alias = normalizeMaterialName(item.alias ?? '')
    if (name === key || seen.has(name)) continue
    if (name.startsWith(key) || alias.startsWith(key)) { prefix.push(item.materialName); seen.add(name) }
    else if (name.includes(key) || alias.includes(key)) { contains.push(item.materialName); seen.add(name) }
  }
  const result = [...prefix, ...contains]
  for (const name of filterMaterialSuggestions(memory, query, memory.length)) { const normalized = normalizeMaterialName(name); if (!seen.has(normalized)) { seen.add(normalized); result.push(name) } }
  return result.slice(0, limit)
}
