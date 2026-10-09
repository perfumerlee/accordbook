export interface MaterialPaletteRecord {
  materialId: string
  materialName: string
  alias?: string
  cas?: string
  dilution?: { percent?: number; solvent?: string }
  notes?: string
  normalizedName: string
  normalizedCas?: string
  createdAt: string
  updatedAt: string
}
export type MaterialPaletteInput = Pick<MaterialPaletteRecord, 'materialName' | 'alias' | 'cas' | 'dilution' | 'notes'>
