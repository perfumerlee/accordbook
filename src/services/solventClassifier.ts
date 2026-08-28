const SOLVENTS = new Set(['ALC', 'DPG', 'IPM', 'TEC'])

export function normalizeMaterialName(name: string): string {
  return name.trim().toUpperCase()
}

export function isSolventMaterial(name: string): boolean {
  return SOLVENTS.has(normalizeMaterialName(name))
}
