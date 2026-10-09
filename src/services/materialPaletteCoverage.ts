import type { FormulaMaterial, FormulaSnapshotRow } from '../models/formula'
import type { MaterialPaletteInput, MaterialPaletteRecord } from '../models/materialPalette'
import { normalizeMaterialName } from './materialIdentity'

export interface PaletteCoverageMaterial {
  key: string
  materialName: string
  sources: MaterialPaletteInput[]
  needsReview: boolean
  match: 'name' | 'alias' | 'ambiguous' | 'missing'
  paletteId?: string
  casConflict: boolean
}
export function formulaMaterialToPalette(row: Pick<FormulaMaterial, 'material' | 'cas' | 'dilution'>): MaterialPaletteInput {
  return { materialName: row.material.trim(), ...(row.cas?.trim() ? { cas: row.cas.trim() } : {}), ...(row.dilution?.enabled ? { dilution: { percent: row.dilution.percent, solvent: row.dilution.solvent } } : {}) }
}
export function calculatePaletteCoverage(rows: readonly (FormulaMaterial | FormulaSnapshotRow)[], palette: readonly MaterialPaletteRecord[]) {
  const names = new Map<string, MaterialPaletteRecord[]>(), aliases = new Map<string, MaterialPaletteRecord[]>()
  const add = (map: Map<string, MaterialPaletteRecord[]>, key: string, record: MaterialPaletteRecord) => { if (!key) return; const group = map.get(key); if (group) group.push(record); else map.set(key, [record]) }
  for (const record of palette) { add(names, normalizeMaterialName(record.materialName), record); if (record.alias) add(aliases, normalizeMaterialName(record.alias), record) }
  const groups = new Map<string, MaterialPaletteInput[]>()
  for (const row of rows) { const key = normalizeMaterialName(row.material); if (key) { const group = groups.get(key); if (group) group.push(formulaMaterialToPalette(row)); else groups.set(key, [formulaMaterialToPalette(row)]) } }
  const matchDetails: PaletteCoverageMaterial[] = [...groups].map(([key, sources]) => {
    const direct = names.get(key), candidates = direct ?? aliases.get(key) ?? [], record = candidates.length === 1 ? candidates[0] : undefined
    const casValues = new Set(sources.map(row => row.cas ?? '')), dilutionValues = new Set(sources.map(row => JSON.stringify(row.dilution ?? null)))
    return { key, materialName: sources[0].materialName, sources, needsReview: casValues.size > 1 || dilutionValues.size > 1 || candidates.length > 1,
      match: record ? direct ? 'name' : 'alias' : candidates.length > 1 ? 'ambiguous' : 'missing', ...(record ? { paletteId: record.materialId } : {}), casConflict: !!record?.cas && sources.some(row => !!row.cas && row.cas !== record.cas) }
  })
  const missingMaterials = matchDetails.filter(item => !item.paletteId), matchedMaterials = matchDetails.length - missingMaterials.length
  return { totalUniqueMaterials: matchDetails.length, matchedMaterials, missingMaterials, coverageRatio: matchDetails.length ? matchedMaterials / matchDetails.length : 0, matchDetails }
}
