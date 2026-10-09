import type { MaterialPaletteInput, MaterialPaletteRecord } from '../models/materialPalette'
import { normalizeMaterialName } from './materialIdentity'

export class PaletteValidationError extends Error {}
export class PaletteDuplicateError extends Error {}
const text = (value: unknown, max: number, required = false): string | undefined => {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new PaletteValidationError('Invalid material field / 원료 입력을 확인해 주세요.')
  return value.trim() || undefined
}
export function validatePaletteInput(input: MaterialPaletteInput): MaterialPaletteInput {
  if (!input || typeof input !== 'object') throw new PaletteValidationError('Invalid material')
  const materialName = text(input.materialName, 200, true)!
  const alias = text(input.alias, 200), cas = text(input.cas, 100), notes = text(input.notes, 2000)
  let dilution: MaterialPaletteInput['dilution']
  if (input.dilution !== undefined) {
    if (!input.dilution || typeof input.dilution !== 'object') throw new PaletteValidationError('Invalid dilution')
    const percent = input.dilution.percent, solvent = text(input.dilution.solvent, 100)
    if (percent !== undefined && (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0 || percent > 100)) throw new PaletteValidationError('Dilution must be > 0 and ≤ 100 / 희석 비율은 0 초과 100 이하입니다.')
    if (percent !== undefined || solvent) dilution = { ...(percent !== undefined ? { percent } : {}), ...(solvent ? { solvent } : {}) }
  }
  return { materialName, ...(alias ? { alias } : {}), ...(cas ? { cas } : {}), ...(notes ? { notes } : {}), ...(dilution ? { dilution } : {}) }
}
/** CAS / Ref. accepts references; invalid CAS syntax is a warning, never a lookup. */
export function paletteCasWarning(cas?: string): boolean {
  if (!cas) return false
  if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) return true
  const digits = cas.replace(/-/g, '')
  return [...digits.slice(0, -1)].reverse().reduce((n, digit, i) => n + Number(digit) * (i + 1), 0) % 10 !== Number(digits[digits.length - 1])
}
export function createPaletteRecord(input: MaterialPaletteInput, previous?: MaterialPaletteRecord): MaterialPaletteRecord {
  const value = validatePaletteInput(input), now = new Date().toISOString()
  return { ...value, materialId: previous?.materialId ?? crypto.randomUUID(), normalizedName: normalizeMaterialName(value.materialName), ...(value.cas ? { normalizedCas: value.cas.trim() } : {}), createdAt: previous?.createdAt ?? now, updatedAt: now }
}
export function validatePaletteRecords(input: unknown): MaterialPaletteRecord[] {
  if (!Array.isArray(input) || input.length > 10000) throw new PaletteValidationError('Invalid Palette data')
  const ids = new Set<string>(), names = new Set<string>()
  return input.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.materialId !== 'string' || !raw.materialId || raw.materialId.length > 200 || typeof raw.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.createdAt)) || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) throw new PaletteValidationError('Invalid Palette record')
    const value = validatePaletteInput(raw), normalizedName = normalizeMaterialName(value.materialName)
    if (ids.has(raw.materialId) || names.has(normalizedName)) throw new PaletteDuplicateError('Duplicate Palette material / 중복 원료입니다.')
    ids.add(raw.materialId); names.add(normalizedName)
    return { ...value, materialId: raw.materialId, normalizedName, ...(value.cas ? { normalizedCas: value.cas.trim() } : {}), createdAt: raw.createdAt, updatedAt: raw.updatedAt }
  })
}
export function mergePaletteRecords(current: MaterialPaletteRecord[], incoming: MaterialPaletteRecord[], mode: 'add' | 'add-formula' | 'update' | 'replace'): MaterialPaletteRecord[] {
  const validated = validatePaletteRecords(incoming)
  if (mode === 'replace') return validated
  const result = new Map(current.map(item => [item.materialId, item]))
  if (mode === 'add-formula') {
    const names = new Set(current.map(item => normalizeMaterialName(item.materialName))), aliases = new Map<string, number>()
    for (const item of current) if (item.alias) { const key = normalizeMaterialName(item.alias); aliases.set(key, (aliases.get(key) ?? 0) + 1) }
    for (const item of validated) if (names.has(item.normalizedName) || aliases.get(item.normalizedName) === 1) throw new PaletteDuplicateError('Already registered in Palette. Refresh and review the selection / 이미 팔레트에 등록된 원료입니다. 선택 항목을 다시 확인해 주세요.')
  }
  for (const item of validated) {
    if ((mode === 'add' || mode === 'add-formula') && result.has(item.materialId)) throw new PaletteDuplicateError('Duplicate material')
    if (mode === 'update' && !result.has(item.materialId)) throw new PaletteValidationError('Material no longer exists / 원료가 삭제되었습니다.')
    result.set(item.materialId, item)
  }
  return validatePaletteRecords([...result.values()])
}
