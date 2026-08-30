const SOLVENTS = new Set([
  'ALC',
  'ALCOHOL',
  'DPG',
  'IPM',
  'TEC',
  'TRIETHYL CITRATE',
  'ETHANOL',
  'PG',
  'PROPYLENE GLYCOL',
])

export function normalizeMaterialName(name: string): string {
  return name.trim().toUpperCase()
}

export function isSolventMaterial(name: string): boolean {
  return SOLVENTS.has(normalizeMaterialName(name))
}
