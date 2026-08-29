import type { NaturalContributionDataset, NaturalContributionEntry } from '../models/naturalContribution'
import { parseCsvRows } from './csvRowParser'

export interface ParseNaturalContributionCsvResult {
  dataset: NaturalContributionDataset
  skippedRows: number
}

export function parseNaturalContributionCsv(text: string): ParseNaturalContributionCsvResult {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return { dataset: { importedAt: new Date().toISOString(), entries: [] }, skippedRows: 0 }

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const ncsCasIndex = header.findIndex((cell) => cell === 'ncs_cas')
  const ncsNameIndex = header.findIndex((cell) => cell === 'ncs_name')
  const constituentCasIndex = header.findIndex((cell) => cell === 'constituent_cas')
  const constituentNameIndex = header.findIndex((cell) => cell === 'constituent_name')
  const percentIndex = header.findIndex((cell) => cell === 'percent')

  const entries: NaturalContributionEntry[] = []
  let skippedRows = 0

  for (const cells of rows.slice(1)) {
    const ncsCas = ncsCasIndex >= 0 ? (cells[ncsCasIndex] ?? '').trim() : ''
    const constituentCas = constituentCasIndex >= 0 ? (cells[constituentCasIndex] ?? '').trim() : ''
    const percentRaw = percentIndex >= 0 ? (cells[percentIndex] ?? '').trim() : ''
    const percent = Number(percentRaw)

    if (!ncsCas || !constituentCas || percentRaw === '' || !Number.isFinite(percent)) { skippedRows += 1; continue }

    entries.push({
      ncsCas,
      ncsName: ncsNameIndex >= 0 ? (cells[ncsNameIndex] ?? '').trim() : '',
      constituentCas,
      constituentName: constituentNameIndex >= 0 ? (cells[constituentNameIndex] ?? '').trim() : '',
      percent,
    })
  }

  return { dataset: { importedAt: new Date().toISOString(), entries }, skippedRows }
}
