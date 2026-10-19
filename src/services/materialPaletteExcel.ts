import type { MaterialPaletteInput, MaterialPaletteRecord } from '../models/materialPalette'
import { normalizeMaterialName } from './materialIdentity'
import { paletteCasWarning, validatePaletteInput } from './materialPalette'

export const PALETTE_SHEET = 'MATERIAL PALETTE'
export const PALETTE_HEADERS = ['Material Name', 'Alias', 'CAS', 'Dilution %', 'Solvent', 'Notes'] as const
export const PALETTE_FILENAME = 'Accordbook-Material-Palette.xlsx'
export const PALETTE_SAMPLE_FILENAME = 'Accordbook-Material-Palette-Sample.xlsx'
export const PALETTE_PASTE_LIMITS = Object.freeze({ maxRows: 10_000, maxColumns: 50, maxTextBytes: 1024 * 1024 })
export const PALETTE_SAMPLE: MaterialPaletteInput[] = ['Iso E Super', 'Hedione', 'Ethylene Brassylate', 'Bergamot FCF', 'Cedarwood Virginia EO', 'Linalyl Acetate', 'Ambroxan', 'Vanillin'].map(materialName => ({ materialName, ...(materialName === 'Ambroxan' ? { dilution: { percent: 10, solvent: 'DPG' }, notes: 'Example of a prepared dilution. Replace with your own material details.' } : { notes: 'Example row. Replace with a material in your own Palette.' }) }))
export interface PaletteExcelRow { rowNumber: number; status: 'READY' | 'WARNING' | 'ERROR'; input?: MaterialPaletteInput; duplicate: boolean; messages: string[] }
export interface PaletteExcelPreview { rows: PaletteExcelRow[]; unsupportedColumns: string[]; totalRows: number; validRows: number; duplicates: number; warnings: number; errors: number }

function parsePaletteTsv(text: string): string[][] {
  if (!text.trim()) throw new Error('Paste spreadsheet data / 스프레드시트 데이터를 붙여넣어 주세요.')
  if (new TextEncoder().encode(text).byteLength > PALETTE_PASTE_LIMITS.maxTextBytes) throw new Error('Paste data is limited to 1 MiB / 붙여넣기는 1 MiB까지 지원합니다.')
  const source = text.replace(/\r\n/g, '\n')
  if (source.includes('\r')) throw new Error('Unsupported line ending / 줄바꿈 형식을 확인해 주세요.')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, afterQuote = false
  const finishRow = () => {
    row.push(cell)
    if (row.some(value => value.trim())) rows.push(row)
    row = []; cell = ''; afterQuote = false
    if (rows.length > PALETTE_PASTE_LIMITS.maxRows + 1) throw new Error('Paste data is limited to 10,000 material rows / 원료는 최대 10,000행까지 붙여넣을 수 있습니다.')
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++ }
        else { quoted = false; afterQuote = true }
      } else cell += char
      continue
    }
    if (afterQuote) {
      if (char === '\t') { row.push(cell); cell = ''; afterQuote = false }
      else if (char === '\n') finishRow()
      else if (char === ' ' || char === '\t') { /* allow whitespace after a quoted cell */ }
      else throw new Error('Malformed quoted cell / 따옴표로 묶인 셀의 형식이 올바르지 않습니다.')
      continue
    }
    if (char === '"') {
      if (cell.length) throw new Error('Malformed quoted cell / 따옴표로 묶인 셀의 형식이 올바르지 않습니다.')
      quoted = true
    } else if (char === '\t') { row.push(cell); cell = '' }
    else if (char === '\n') finishRow()
    else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted cell / 닫히지 않은 따옴표가 있습니다.')
  if (row.length || cell.length || afterQuote) finishRow()
  if (!rows.length) throw new Error('No material rows found / 원료 행을 찾을 수 없습니다.')
  if (rows.some(cells => cells.length > PALETTE_PASTE_LIMITS.maxColumns)) throw new Error('Paste data is limited to 50 columns / 붙여넣기는 최대 50열까지 지원합니다.')
  return rows
}

/** Converts spreadsheet clipboard text to the same validated preview used by XLSX imports. */
export async function readPalettePaste(text: string, palette: readonly MaterialPaletteRecord[]): Promise<PaletteExcelPreview> {
  const rows = parsePaletteTsv(text)
  if (!rows[0].some(value => value.trim() === 'Material Name')) throw new Error('Include a Material Name header / Material Name 열을 포함해 주세요.')
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet(PALETTE_SHEET)
  sheet.addRows(rows)
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
  return readPaletteExcel(bytes, palette)
}

export async function writePaletteExcel(materials: readonly MaterialPaletteInput[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet(PALETTE_SHEET)
  sheet.addRow([...PALETTE_HEADERS])
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  for (const value of materials) { const item = validatePaletteInput(value); sheet.addRow([item.materialName, item.alias ?? '', item.cas ?? '', item.dilution?.percent ?? '', item.dilution?.solvent ?? '', item.notes ?? '']) }
  sheet.columns.forEach((column, index) => { column.width = index === 5 ? 64 : index === 0 ? 32 : 22 })
  const bytes = await workbook.xlsx.writeBuffer()
  return new Uint8Array(bytes).buffer
}
export async function readPaletteExcel(bytes: ArrayBuffer, palette: readonly MaterialPaletteRecord[]): Promise<PaletteExcelPreview> {
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Choose an XLSX file under 5 MB / 5 MB 이하 XLSX 파일을 선택해 주세요.')
  // Bound the archive's declared expansion before handing it to the workbook parser.
  const view = new DataView(bytes); let expanded = 0
  for (let offset = 0; offset + 46 <= bytes.byteLength; offset++) if (view.getUint32(offset, true) === 0x02014b50) { expanded += view.getUint32(offset + 24, true); if (expanded > 32 * 1024 * 1024) throw new Error('Workbook is too large / Excel 파일이 너무 큽니다.'); offset += 45 }
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(bytes) } catch { throw new Error('Invalid XLSX workbook / 유효하지 않은 XLSX 파일입니다.') }
  const sheet = workbook.getWorksheet(PALETTE_SHEET)
  if (!sheet) throw new Error('Required sheet: MATERIAL PALETTE / 시트 이름을 확인해 주세요.')
  if (sheet.rowCount > 10001 || sheet.columnCount > 50) throw new Error('Workbook exceeds 10,000 rows or 50 columns / 행 또는 열 제한을 초과했습니다.')
  const headers: string[] = []
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { if (typeof cell.value !== 'string' && cell.value !== null) throw new Error('Invalid header'); headers[col - 1] = cell.text.trim() })
  const nonempty = headers.filter(Boolean)
  if (new Set(nonempty).size !== nonempty.length) throw new Error('Duplicate headers / 중복 열 이름입니다.')
  if (!headers.includes('Material Name')) throw new Error('Missing Material Name header / Material Name 열이 필요합니다.')
  const unsupportedColumns = nonempty.filter(value => !(PALETTE_HEADERS as readonly string[]).includes(value)), seen = new Map(palette.map(item => [normalizeMaterialName(item.materialName), item.cas ?? '']))
  const rows: PaletteExcelRow[] = []
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index)
    if (!row.hasValues || (row.values as unknown[]).every(value => value === undefined || value === null || (typeof value === 'string' && !value.trim()))) continue
    const result: PaletteExcelRow = { rowNumber: index, status: 'READY', duplicate: false, messages: [] }
    try {
      const value = (header: typeof PALETTE_HEADERS[number]): string | number | undefined => {
        const position = headers.indexOf(header); if (position < 0) return undefined
        const cell = row.getCell(position + 1).value
        if (cell === null || cell === undefined || cell === '') return undefined
        if (typeof cell !== 'string' && typeof cell !== 'number') throw new Error('Use text/numbers, not formulas or links / 수식이나 링크 대신 텍스트·숫자를 입력해 주세요.')
        return cell
      }
      const raw = value('Dilution %'), solvent = value('Solvent')
      const input = validatePaletteInput({ materialName: String(value('Material Name') ?? ''), alias: String(value('Alias') ?? ''), cas: String(value('CAS') ?? ''), notes: String(value('Notes') ?? ''), dilution: { ...(raw === undefined ? {} : { percent: typeof raw === 'number' ? raw : /^\s*\d+(?:\.\d+)?\s*$/.test(raw) ? Number(raw) : NaN }), ...(solvent === undefined ? {} : { solvent: String(solvent) }) } })
      result.input = input
      const key = normalizeMaterialName(input.materialName)
      if (seen.has(key)) { result.duplicate = true; result.messages.push('Duplicate — skipped / 중복 — 건너뜀'); if (seen.get(key) && input.cas && seen.get(key) !== input.cas) result.messages.push('Conflicting CAS / CAS 불일치') }
      else seen.set(key, input.cas ?? '')
      if (paletteCasWarning(input.cas)) result.messages.push('CAS / Ref. needs review / CAS·참조 번호 확인 필요')
      if (result.messages.length) result.status = 'WARNING'
    } catch (error) { result.status = 'ERROR'; result.messages.push(error instanceof Error ? error.message : 'Invalid row') }
    rows.push(result)
  }
  return { rows, unsupportedColumns, totalRows: rows.length, validRows: rows.filter(row => row.status !== 'ERROR').length, duplicates: rows.filter(row => row.duplicate).length, warnings: rows.filter(row => row.status === 'WARNING').length, errors: rows.filter(row => row.status === 'ERROR').length }
}
export function downloadPaletteExcel(bytes: ArrayBuffer, sample = false) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = sample ? PALETTE_SAMPLE_FILENAME : PALETTE_FILENAME; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
