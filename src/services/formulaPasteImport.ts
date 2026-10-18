import type { FormulaMaterial } from '../models/formula'
import { calculateFormulaTotals } from './formulaCalculator'
import { normalizeMaterialName } from './materialIdentity'
import { recognizeFormulaPasteDilution, type DilutionRecognition } from './formulaPasteDilution'

export const FORMULA_PASTE_LIMITS = Object.freeze({ maxMaterialRows: 200, maxTextBytes: 100 * 1024 })
export const FORMULA_PASTE_TARGET_PARTS = 1000

export type FormulaPasteIssueCode =
  | 'INPUT_EMPTY' | 'INPUT_TOO_LARGE' | 'TOO_MANY_ROWS' | 'MALFORMED_QUOTING' | 'MULTILINE_QUOTED_CELL' | 'UNSUPPORTED_LINE_ENDING'
  | 'COLUMN_MAPPING_REQUIRED' | 'COLUMN_MAPPING_INVALID' | 'UNMAPPED_NONEMPTY_COLUMN' | 'NO_IMPORTABLE_ROWS'
  | 'MATERIAL_EMPTY' | 'PARTS_EMPTY' | 'PARTS_INVALID' | 'PARTS_NEGATIVE' | 'PARTS_DECIMAL' | 'PARTS_AMBIGUOUS_COMMA' | 'PARTS_UNSAFE_INTEGER' | 'TOTAL_UNSAFE_INTEGER'
  | 'DUPLICATE_MATERIAL' | 'TOTAL_NOT_1000'
export type FormulaPasteIssue = { code: FormulaPasteIssueCode; severity: 'error' | 'warning'; rowNumber?: number; columnIndex?: number }

export type FormulaPasteParsedRow = { sourceRowNumber: number; cells: string[] }
export type FormulaPasteMapping = { materialColumn: number; partsColumn: number; ignoredColumns?: number[]; headerRowNumber?: number }
export type FormulaPasteParseResult = {
  rows: FormulaPasteParsedRow[]
  columnCount: number
  issues: FormulaPasteIssue[]
}
export type FormulaPasteColumnDetection = {
  status: 'detected' | 'explicit_required' | 'invalid'
  mapping?: FormulaPasteMapping
  issues: FormulaPasteIssue[]
}
export type FormulaPasteCandidateRow = {
  sourceRowNumber: number
  originalMaterial: string
  material: string
  originalParts: string
  parts?: number
  issues: FormulaPasteIssue[]
  /** Review-only proposal derived from the original cell; never changes material or Parts. */
  dilutionRecognition: DilutionRecognition
}
/** Corrections are keyed by the original spreadsheet row, never by display position. */
export type FormulaPasteEdits = Readonly<Record<number, { material?: string; partsText?: string }>>
export type FormulaPasteValidationResult = {
  rows: FormulaPasteCandidateRow[]
  mapping?: FormulaPasteMapping
  mappingStatus: 'detected' | 'explicit' | 'explicit_required' | 'invalid'
  issues: FormulaPasteIssue[]
  totalParts: number
  targetParts: number
  hasBlockingErrors: boolean
  readyForApproval: boolean
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes++
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++ }
    else bytes += 3
  }
  return bytes
}

function issue(code: FormulaPasteIssueCode, severity: FormulaPasteIssue['severity'], rowNumber?: number, columnIndex?: number): FormulaPasteIssue {
  return { code, severity, ...(rowNumber === undefined ? {} : { rowNumber }), ...(columnIndex === undefined ? {} : { columnIndex }) }
}

type TsvResult = { rows: FormulaPasteParsedRow[]; columnCount: number; error?: FormulaPasteIssueCode }

/** Parses spreadsheet plain text without touching clipboard, DOM, storage, or network APIs. */
function parseTsv(text: string): TsvResult {
  const source = text.replace(/\r\n/g, '\n')
  if (source.includes('\r')) return { rows: [], columnCount: 0, error: 'UNSUPPORTED_LINE_ENDING' }
  const rows: FormulaPasteParsedRow[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let afterQuote = false
  let sourceRowNumber = 1
  let columnCount = 0
  const finishRow = () => {
    cells.push(cell)
    if (cells.some(value => value.trim() !== '')) {
      rows.push({ sourceRowNumber, cells })
      columnCount = Math.max(columnCount, cells.length)
    }
    cells = []
    cell = ''
    afterQuote = false
    sourceRowNumber++
  }

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++ }
        else { quoted = false; afterQuote = true }
      } else if (char === '\n') return { rows: [], columnCount: 0, error: 'MULTILINE_QUOTED_CELL' }
      else cell += char
      continue
    }
    if (afterQuote) {
      if (char === '\t') { cells.push(cell); cell = ''; afterQuote = false }
      else if (char === '\n') finishRow()
      else if (char === ' ' || char === '\t') { /* allow whitespace after a quoted cell */ }
      else return { rows: [], columnCount: 0, error: 'MALFORMED_QUOTING' }
      continue
    }
    if (char === '"') {
      if (cell.length !== 0) return { rows: [], columnCount: 0, error: 'MALFORMED_QUOTING' }
      quoted = true
    } else if (char === '\t') { cells.push(cell); cell = '' }
    else if (char === '\n') finishRow()
    else cell += char
  }
  if (quoted) return { rows: [], columnCount: 0, error: 'MALFORMED_QUOTING' }
  if (cells.length || cell.length || afterQuote) finishRow()
  return { rows, columnCount }
}

export function parseFormulaPaste(input: string): FormulaPasteParseResult {
  if (!input.trim()) return { rows: [], columnCount: 0, issues: [issue('INPUT_EMPTY', 'error')] }
  if (utf8ByteLength(input) > FORMULA_PASTE_LIMITS.maxTextBytes) return { rows: [], columnCount: 0, issues: [issue('INPUT_TOO_LARGE', 'error')] }
  const parsed = parseTsv(input)
  if (parsed.error) return { rows: [], columnCount: 0, issues: [issue(parsed.error, 'error')] }
  // Permit one possible header here; enforce the material-row cap after column/header mapping.
  if (parsed.rows.length > FORMULA_PASTE_LIMITS.maxMaterialRows + 1) return { rows: [], columnCount: parsed.columnCount, issues: [issue('TOO_MANY_ROWS', 'error')] }
  if (!parsed.rows.length) return { rows: [], columnCount: parsed.columnCount, issues: [issue('INPUT_EMPTY', 'error')] }
  return { rows: parsed.rows.map(row => ({ ...row, cells: [...row.cells] })), columnCount: parsed.columnCount, issues: [] }
}

const MATERIAL_HEADERS = new Set(['material', 'materialname', 'ingredient', 'ingredients', 'rawmaterial', 'rawmaterialname', '원료', '원료명', '향료', '향료명'])
const PARTS_HEADERS = new Set(['parts', 'part', 'amount', 'quantity', 'qty', '배합량', '파트', '투입량'])
const normalizeHeader = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s._/-]+/g, '')

export function detectFormulaPasteColumns(parsed: FormulaPasteParseResult): FormulaPasteColumnDetection {
  if (parsed.issues.some(item => item.severity === 'error')) return { status: 'invalid', issues: [...parsed.issues] }
  const header = parsed.rows[0]
  if (!header) return { status: 'explicit_required', issues: [issue('COLUMN_MAPPING_REQUIRED', 'error')] }
  const materials = header.cells.flatMap((cell, index) => MATERIAL_HEADERS.has(normalizeHeader(cell)) ? [index] : [])
  const parts = header.cells.flatMap((cell, index) => PARTS_HEADERS.has(normalizeHeader(cell)) ? [index] : [])
  if (materials.length === 1 && parts.length === 1 && materials[0] !== parts[0]) {
    return { status: 'detected', mapping: { materialColumn: materials[0], partsColumn: parts[0], headerRowNumber: header.sourceRowNumber }, issues: [] }
  }
  return { status: 'explicit_required', issues: [issue('COLUMN_MAPPING_REQUIRED', 'error')] }
}

function validMapping(parsed: FormulaPasteParseResult, mapping: FormulaPasteMapping): boolean {
  const { materialColumn, partsColumn } = mapping
  if (!Number.isSafeInteger(materialColumn) || !Number.isSafeInteger(partsColumn) || materialColumn < 0 || partsColumn < 0 || materialColumn === partsColumn || materialColumn >= parsed.columnCount || partsColumn >= parsed.columnCount) return false
  if (mapping.headerRowNumber !== undefined && !parsed.rows.some(row => row.sourceRowNumber === mapping.headerRowNumber)) return false
  const ignored = mapping.ignoredColumns ?? []
  return ignored.every(index => Number.isSafeInteger(index) && index >= 0 && index < parsed.columnCount && index !== materialColumn && index !== partsColumn) && new Set(ignored).size === ignored.length
}

function partsIssue(raw: string): { value?: number; code?: FormulaPasteIssueCode } {
  const value = raw.trim()
  if (!value) return { code: 'PARTS_EMPTY' }
  if (value.includes(',')) return { code: 'PARTS_AMBIGUOUS_COMMA' }
  if (/^-/.test(value)) return { code: 'PARTS_NEGATIVE' }
  if (/^\+?\d+\.\d+$/.test(value)) return { code: 'PARTS_DECIMAL' }
  if (!/^\+?\d+$/.test(value)) return { code: 'PARTS_INVALID' }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return { code: 'PARTS_UNSAFE_INTEGER' }
  return { value: parsed }
}

export function validateFormulaPaste(parsed: FormulaPasteParseResult, selectedMapping?: FormulaPasteMapping): FormulaPasteValidationResult {
  return validatePaste(parsed, selectedMapping)
}

/** Revalidates corrections without reparsing or replacing original cell values. */
export function validateFormulaPasteEdits(parsed: FormulaPasteParseResult, mapping: FormulaPasteMapping | undefined, edits: FormulaPasteEdits): FormulaPasteValidationResult {
  return validatePaste(parsed, mapping, edits)
}

function validatePaste(parsed: FormulaPasteParseResult, selectedMapping?: FormulaPasteMapping, edits: FormulaPasteEdits = {}): FormulaPasteValidationResult {
  const detected = detectFormulaPasteColumns(parsed)
  const mapping = selectedMapping ?? detected.mapping
  const mappingStatus: FormulaPasteValidationResult['mappingStatus'] = selectedMapping ? 'explicit' : detected.status
  const globalIssues: FormulaPasteIssue[] = [...parsed.issues]
  if (!parsed.issues.some(item => item.severity === 'error')) {
    if (!mapping) globalIssues.push(issue('COLUMN_MAPPING_REQUIRED', 'error'))
    else if (!validMapping(parsed, mapping)) globalIssues.push(issue('COLUMN_MAPPING_INVALID', 'error'))
  }
  if (!mapping || !validMapping(parsed, mapping) || parsed.issues.some(item => item.severity === 'error')) {
    return { rows: [], ...(mapping ? { mapping: { ...mapping, ignoredColumns: mapping.ignoredColumns ? [...mapping.ignoredColumns] : undefined } } : {}), mappingStatus: mapping ? 'invalid' : mappingStatus, issues: globalIssues, totalParts: 0, targetParts: FORMULA_PASTE_TARGET_PARTS, hasBlockingErrors: true, readyForApproval: false }
  }

  const ignored = new Set(mapping.ignoredColumns ?? [])
  const materialRowCount = parsed.rows.filter(row => row.sourceRowNumber !== mapping.headerRowNumber).length
  if (materialRowCount > FORMULA_PASTE_LIMITS.maxMaterialRows) globalIssues.push(issue('TOO_MANY_ROWS', 'error'))
  const candidateRows: FormulaPasteCandidateRow[] = []
  for (const row of parsed.rows) {
    if (row.sourceRowNumber === mapping.headerRowNumber) continue
    const issues: FormulaPasteIssue[] = []
    for (let column = 0; column < row.cells.length; column++) {
      if (column !== mapping.materialColumn && column !== mapping.partsColumn && !ignored.has(column) && row.cells[column].trim()) {
        globalIssues.push(issue('UNMAPPED_NONEMPTY_COLUMN', 'error', row.sourceRowNumber, column))
      }
    }
    const originalMaterial = row.cells[mapping.materialColumn] ?? ''
    const originalParts = row.cells[mapping.partsColumn] ?? ''
    const edit = edits[row.sourceRowNumber]
    const material = (edit?.material ?? originalMaterial).trim()
    if (!material) issues.push(issue('MATERIAL_EMPTY', 'error', row.sourceRowNumber, mapping.materialColumn))
    const partResult = partsIssue(edit?.partsText ?? originalParts)
    if (partResult.code) issues.push(issue(partResult.code, 'error', row.sourceRowNumber, mapping.partsColumn))
    candidateRows.push({ sourceRowNumber: row.sourceRowNumber, originalMaterial, material, originalParts, ...(partResult.value === undefined ? {} : { parts: partResult.value }), dilutionRecognition: recognizeFormulaPasteDilution(originalMaterial), issues })
  }

  const seenMaterials = new Set<string>()
  for (const row of candidateRows) {
    if (!row.material) continue
    const key = normalizeMaterialName(row.material)
    if (!key) continue
    if (seenMaterials.has(key)) row.issues.push(issue('DUPLICATE_MATERIAL', 'warning', row.sourceRowNumber, mapping.materialColumn))
    seenMaterials.add(key)
  }

  const validForTotal: FormulaMaterial[] = candidateRows.flatMap((row, index) => row.parts !== undefined && row.material && !row.issues.some(item => item.severity === 'error')
    ? [{ id: `paste-${index}`, material: row.material, parts: row.parts }]
    : [])
  const totalParts = calculateFormulaTotals(validForTotal).totalParts
  const hasRows = candidateRows.length > 0
  if (!hasRows) globalIssues.push(issue('NO_IMPORTABLE_ROWS', 'error'))
  if (!Number.isSafeInteger(totalParts)) globalIssues.push(issue('TOTAL_UNSAFE_INTEGER', 'error'))
  if (hasRows && validForTotal.length > 0 && totalParts !== FORMULA_PASTE_TARGET_PARTS) globalIssues.push(issue('TOTAL_NOT_1000', 'warning'))
  const allIssues = [...globalIssues, ...candidateRows.flatMap(row => row.issues)]
  const hasBlockingErrors = allIssues.some(item => item.severity === 'error')
  return {
    rows: candidateRows.map(row => ({ ...row, issues: [...row.issues] })),
    mapping: { ...mapping, ignoredColumns: mapping.ignoredColumns ? [...mapping.ignoredColumns] : undefined },
    mappingStatus,
    issues: allIssues,
    totalParts,
    targetParts: FORMULA_PASTE_TARGET_PARTS,
    hasBlockingErrors: hasBlockingErrors || !hasRows || validForTotal.length === 0,
    readyForApproval: !hasBlockingErrors && hasRows && validForTotal.length > 0,
  }
}
