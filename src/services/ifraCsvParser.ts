import type { IfraDataset, IfraMaterial } from '../models/ifra'
import { parseCsvRows } from './csvRowParser'

const RESERVED_COLUMNS = new Set(['cas', 'name', 'allergen_26', 'allergen_83', 'declared_name'])

function normalizeCas(value: string): string {
  return value.trim()
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === '') return undefined
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return undefined
}

export interface ParseIfraCsvResult {
  dataset: IfraDataset
  skippedRows: number
}

export function parseIfraCsv(text: string): ParseIfraCsvResult {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return { dataset: { importedAt: new Date().toISOString(), categoryKeys: [], materials: [] }, skippedRows: 0 }

  const header = rows[0].map((cell) => cell.trim())
  const casIndex = header.findIndex((cell) => cell.toLowerCase() === 'cas')
  const nameIndex = header.findIndex((cell) => cell.toLowerCase() === 'name')
  const categoryColumns = header
    .map((cell, index) => ({ key: cell, index }))
    .filter(({ key }) => key !== '' && !RESERVED_COLUMNS.has(key.toLowerCase()))
  const columnIndex = (column: string) => header.findIndex((cell) => cell.toLowerCase() === column)

  const materials: IfraMaterial[] = []
  let skippedRows = 0

  for (const cells of rows.slice(1)) {
    const cas = casIndex >= 0 ? normalizeCas(cells[casIndex] ?? '') : ''
    if (!cas) { skippedRows += 1; continue }

    const limits: Record<string, number> = {}
    for (const { key, index } of categoryColumns) {
      const raw = (cells[index] ?? '').trim()
      if (raw === '') continue
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) limits[key] = parsed
    }

    const allergen26Index = columnIndex('allergen_26')
    const allergen83Index = columnIndex('allergen_83')
    const declaredNameIndex = columnIndex('declared_name')
    const declaredNameRaw = declaredNameIndex >= 0 ? (cells[declaredNameIndex] ?? '').trim() : ''

    materials.push({
      cas,
      name: nameIndex >= 0 ? (cells[nameIndex] ?? '').trim() : '',
      limits,
      allergen26: allergen26Index >= 0 ? parseBoolean(cells[allergen26Index]) : undefined,
      allergen83: allergen83Index >= 0 ? parseBoolean(cells[allergen83Index]) : undefined,
      declaredName: declaredNameRaw !== '' ? declaredNameRaw : undefined,
    })
  }

  return {
    dataset: {
      importedAt: new Date().toISOString(),
      categoryKeys: categoryColumns.map(({ key }) => key),
      materials,
    },
    skippedRows,
  }
}
