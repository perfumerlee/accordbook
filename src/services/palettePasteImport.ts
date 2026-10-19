import type { MaterialPaletteInput, MaterialPaletteRecord } from '../models/materialPalette'
import type { PaletteExcelRow, PaletteExcelPreview } from './materialPaletteExcel'
import { parsePaletteTsv, PALETTE_PASTE_LIMITS } from './paletteSpreadsheetText'
import { normalizeMaterialName } from './materialIdentity'
import { validatePaletteInput, paletteCasWarning } from './materialPalette'
import { recognizeFormulaPasteDilution, validateFormulaPasteDilutionChoice, type FormulaPasteDilutionReviewChoice, type DilutionRecognition } from './formulaPasteDilution'

export const PALETTE_FIELDS = ['materialName', 'alias', 'cas', 'percent', 'solvent', 'notes'] as const
export type PaletteField = typeof PALETTE_FIELDS[number]
export type PaletteColumn = PaletteField | 'ignore' | 'unmapped'
export interface PalettePasteMapping { header: boolean; columns: PaletteColumn[] }
export type PalettePasteChoices = Record<number, FormulaPasteDilutionReviewChoice>
export interface PalettePasteRow extends PaletteExcelRow {
  original: MaterialPaletteInput
  recognition: DilutionRecognition
  conflict: boolean
}
export interface PalettePastePreview extends PaletteExcelPreview { rows: PalettePasteRow[] }

const aliases: Record<PaletteField, string[]> = {
  materialName: ['Material Name', 'Material', 'Ingredient', 'Ingredients', 'Raw Material', 'Raw Material Name', '원료명', '원료', '향료명', '향료'],
  alias: ['Alias', 'Aliases', 'Synonym', 'Synonyms', '별칭', '동의어', '다른 이름'],
  cas: ['CAS', 'CAS Number', 'CAS No', 'CAS #', 'CAS / Ref.', 'CAS 번호', 'CAS번호', '참조 번호', '참조번호', 'Reference', 'Ref'],
  percent: ['Dilution %', 'Dilution (%)', 'Dilution Percent', '희석 %', '희석률', '희석 비율', '희석 농도'],
  solvent: ['Solvent', 'Carrier', 'Solvent / Carrier', '용매', '용매 / 베이스'],
  notes: ['Notes', 'Note', 'Memo', 'Comments', '노트', '메모', '비고'],
}
const normalizeHeader = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/[\s._/#()%\-]+/g, '')
export function preparePalettePaste(text: string) {
  const rows = parsePaletteTsv(text)
  const width = Math.max(...rows.map(row => row.length))
  const recognized = Array.from({ length: width }, (_, index) => PALETTE_FIELDS.find(field => aliases[field].some(alias => normalizeHeader(alias) === normalizeHeader(rows[0][index] ?? ''))))
  const header = recognized.some(Boolean)
  const columns: PaletteColumn[] = recognized.map((field, index) => {
    if (!rows.some(row => row[index]?.trim())) return 'ignore'
    return header && field && recognized.filter(value => value === field).length === 1 ? field : 'unmapped'
  })
  return { rows, mapping: { header, columns } satisfies PalettePasteMapping }
}

export function reviewPalettePaste(rows: string[][], mapping: PalettePasteMapping, palette: readonly MaterialPaletteRecord[], choices: PalettePasteChoices = {}): PalettePastePreview {
  const width = Math.max(0, ...rows.map(row => row.length)), fields = mapping.columns.filter(value => value !== 'ignore')
  if (mapping.columns.length !== width || mapping.columns.some(value => value !== 'ignore' && !(PALETTE_FIELDS as readonly string[]).includes(value))) throw Error('Map or exclude every column / 각 열을 연결하거나 제외해 주세요.')
  if (!fields.includes('materialName')) throw Error('Select a Material Name column / 원료명 열을 선택해 주세요.')
  if (new Set(fields).size !== fields.length) throw Error('Use each field only once / 같은 항목에 여러 열을 연결할 수 없습니다.')
  const start = mapping.header ? 1 : 0
  if (rows.length - start > PALETTE_PASTE_LIMITS.maxRows) throw Error('Too many material rows / 원료 행 제한을 초과했습니다.')
  const seen = new Map(palette.map(item => [normalizeMaterialName(item.materialName), item.cas ?? '']))
  const results: PalettePasteRow[] = []
  rows.slice(start).forEach((cells, offset) => {
    const rowNumber = start + offset + 1
    const value = (field: PaletteField) => cells[mapping.columns.indexOf(field)]?.trim() ?? ''
    const percent = value('percent'), solvent = value('solvent')
    const original: MaterialPaletteInput = { materialName: value('materialName'), alias: value('alias'), cas: value('cas'), notes: value('notes'), dilution: { ...(percent ? { percent: /^\d+(?:\.\d+)?\s*%?$/.test(percent) ? Number(percent.replace(/%$/, '').trim()) : NaN } : {}), ...(solvent ? { solvent } : {}) } }
    const recognition = recognizeFormulaPasteDilution(original.materialName)
    const conflict = recognition.status === 'proposed' && ((!!percent && original.dilution?.percent !== recognition.proposedPercent) || (!!solvent && solvent !== recognition.proposedSolvent))
    const result: PalettePasteRow = { rowNumber, original, recognition, conflict, status: 'READY', duplicate: false, messages: [] }
    try {
      const choice = choices[rowNumber] ?? { mode: 'keep_original' as const }
      const decision = validateFormulaPasteDilutionChoice(recognition, choice)
      if (decision.status === 'invalid') throw Error('Complete the material, dilution percentage and solvent / 원료명·희석 비율·용매를 확인해 주세요.')
      const candidate = decision.status === 'approved' ? { ...original, materialName: decision.material, dilution: { percent: decision.dilution.percent, solvent: decision.dilution.solvent } } : original
      const input = validatePaletteInput(candidate)
      result.input = input
      const key = normalizeMaterialName(input.materialName)
      if (seen.has(key)) {
        result.duplicate = true
        result.messages.push('Duplicate — skipped / 중복 — 건너뜀')
        if (seen.get(key) && input.cas && seen.get(key) !== input.cas) result.messages.push('Conflicting CAS / CAS 불일치')
      } else seen.set(key, input.cas ?? '')
      if (paletteCasWarning(input.cas)) result.messages.push('CAS / Ref. needs review / CAS·참조 번호 확인 필요')
      if (recognition.status === 'ambiguous' || recognition.status === 'invalid') result.messages.push('Uncertain dilution notation: original name retained / 불확실한 희석 표기: 원료명 원문 유지')
      if (result.messages.length) result.status = 'WARNING'
    } catch (error) { result.status = 'ERROR'; result.messages.push(error instanceof Error ? error.message : 'Invalid row') }
    results.push(result)
  })
  return { rows: results, unsupportedColumns: mapping.columns.flatMap((field, index) => field === 'ignore' ? [mapping.header ? rows[0][index] || `Column ${index + 1}` : `Column ${index + 1}`] : []), totalRows: results.length, validRows: results.filter(row => row.status !== 'ERROR').length, duplicates: results.filter(row => row.duplicate).length, warnings: results.filter(row => row.status === 'WARNING').length, errors: results.filter(row => row.status === 'ERROR').length }
}
