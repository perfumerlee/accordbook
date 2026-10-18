import { describe, expect, it } from 'vitest'
import { detectFormulaPasteColumns, FORMULA_PASTE_LIMITS, parseFormulaPaste, validateFormulaPaste, type FormulaPasteMapping } from '../src/services/formulaPasteImport'

const mapping: FormulaPasteMapping = { materialColumn: 0, partsColumn: 1 }
const parsedFor = (text: string) => parseFormulaPaste(text)

describe('Formula Paste Import parser and validation', () => {
  it('detects recognized Material / Parts headers and validates rows', () => {
    const parsed = parsedFor('Material\tParts\nBergamot FCF\t400\nHedione\t600')
    expect(detectFormulaPasteColumns(parsed).status).toBe('detected')
    const result = validateFormulaPaste(parsed)
    expect(result.rows.map(row => [row.material, row.parts])).toEqual([['Bergamot FCF', 400], ['Hedione', 600]])
    expect(result.totalParts).toBe(1000)
    expect(result.readyForApproval).toBe(true)
  })

  it('requires an explicit mapping for a headerless paste and does not alter input', () => {
    const text = 'Bergamot\t400\nHedione\t600'
    const parsed = parsedFor(text)
    expect(detectFormulaPasteColumns(parsed).status).toBe('explicit_required')
    expect(validateFormulaPaste(parsed).readyForApproval).toBe(false)
    expect(validateFormulaPaste(parsed, mapping).readyForApproval).toBe(true)
    expect(text).toBe('Bergamot\t400\nHedione\t600')
  })

  it('supports reversed columns when explicitly mapped', () => {
    const result = validateFormulaPaste(parsedFor('120\tBergamot\n880\tHedione'), { materialColumn: 1, partsColumn: 0 })
    expect(result.rows.map(row => [row.material, row.parts])).toEqual([['Bergamot', 120], ['Hedione', 880]])
    expect(result.readyForApproval).toBe(true)
  })

  it.each(['\r\n', '\n'])('handles line ending %j and preserves source rows', newline => {
    const result = validateFormulaPaste(parsedFor(`Material${newline}\nBergamot\t100${newline}${newline}Hedione\t900`), { ...mapping, headerRowNumber: 1 })
    expect(result.rows.map(row => row.sourceRowNumber)).toEqual([3, 5])
  })

  it('ignores blank rows and trims surrounding cell whitespace', () => {
    const result = validateFormulaPaste(parsedFor(' Material \t Parts \n  Hedione \t 1000 '))
    expect(result.rows[0].originalMaterial).toBe('  Hedione ')
    expect(result.rows[0].material).toBe('Hedione')
    expect(result.rows[0].originalParts).toBe(' 1000 ')
    expect(result.readyForApproval).toBe(true)
  })

  it('detects unambiguous Korean headers', () => {
    const result = validateFormulaPaste(parsedFor('원료명\t배합량\n리날룰\t1000'))
    expect(result.mappingStatus).toBe('detected')
    expect(result.readyForApproval).toBe(true)
  })

  it('rejects mapping to the same column, invalid indexes, and invalid ignored columns', () => {
    const parsed = parsedFor('A\t1\t')
    for (const invalid of [
      { materialColumn: 0, partsColumn: 0 },
      { materialColumn: -1, partsColumn: 1 },
      { materialColumn: 0, partsColumn: 3 },
      { materialColumn: 0, partsColumn: 1, ignoredColumns: [0] },
      { materialColumn: 0, partsColumn: 1, ignoredColumns: [2, 2] },
    ]) {
      expect(validateFormulaPaste(parsed, invalid).issues.some(item => item.code === 'COLUMN_MAPPING_INVALID')).toBe(true)
    }
  })

  it('requires explicit handling of any nonempty additional column', () => {
    const parsed = parsedFor('Hedione\t1000\tnote')
    expect(validateFormulaPaste(parsed, mapping).issues).toContainEqual(expect.objectContaining({ code: 'UNMAPPED_NONEMPTY_COLUMN', columnIndex: 2 }))
    expect(validateFormulaPaste(parsed, { ...mapping, ignoredColumns: [2] }).readyForApproval).toBe(true)
    expect(validateFormulaPaste(parsed, mapping).readyForApproval).toBe(false)
  })

  it('reports empty material and empty parts as blocking row issues', () => {
    const result = validateFormulaPaste(parsedFor('\t100\nHedione\t'), mapping)
    expect(result.rows[0].issues.map(item => item.code)).toContain('MATERIAL_EMPTY')
    expect(result.rows[1].issues.map(item => item.code)).toContain('PARTS_EMPTY')
    expect(result.hasBlockingErrors).toBe(true)
  })

  it('accepts zero but rejects negative, decimal, nonnumeric, comma, and unsafe integer parts', () => {
    const cases: Array<[string, string]> = [
      ['0', ''], ['-1', 'PARTS_NEGATIVE'], ['1.5', 'PARTS_DECIMAL'], ['one', 'PARTS_INVALID'],
      ['1,000', 'PARTS_AMBIGUOUS_COMMA'], ['9007199254740992', 'PARTS_UNSAFE_INTEGER'], ['Infinity', 'PARTS_INVALID'], ['NaN', 'PARTS_INVALID'],
    ]
    for (const [value, expected] of cases) {
      const row = validateFormulaPaste(parsedFor(`Hedione\t${value}`), mapping).rows[0]
      if (!expected) expect(row.parts).toBe(0)
      else expect(row.issues.map(item => item.code)).toContain(expected)
    }
  })

  it('blocks a total that cannot be represented as a safe integer', () => {
    const result = validateFormulaPaste(parsedFor('A\t9007199254740991\nB\t1'), mapping)
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TOTAL_UNSAFE_INTEGER', severity: 'error' }))
    expect(result.readyForApproval).toBe(false)
  })

  it('warns on duplicate material names without merging and accepts unknown materials', () => {
    const result = validateFormulaPaste(parsedFor('Unknown material\t400\n unknown MATERIAL \t600'), mapping)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1].issues).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_MATERIAL', severity: 'warning' }))
    expect(result.readyForApproval).toBe(true)
  })

  it('warns when total is below or above 1,000 without blocking approval', () => {
    for (const value of [900, 1100]) {
      const result = validateFormulaPaste(parsedFor(`Hedione\t${value}`), mapping)
      expect(result.totalParts).toBe(value)
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TOTAL_NOT_1000', severity: 'warning' }))
      expect(result.readyForApproval).toBe(true)
    }
  })

  it('handles empty input and rejects bare CR line endings', () => {
    expect(parsedFor(' \n\t ').issues[0].code).toBe('INPUT_EMPTY')
    expect(parsedFor('A\t1\rB\t2').issues[0].code).toBe('UNSUPPORTED_LINE_ENDING')
  })

  it('enforces the row limit without returning a silently truncated result', () => {
    const dataRows = Array.from({ length: FORMULA_PASTE_LIMITS.maxMaterialRows + 1 }, (_, index) => `M${index}\t1`).join('\n')
    const rejected = validateFormulaPaste(parsedFor(dataRows), mapping)
    expect(rejected.issues.some(item => item.code === 'TOO_MANY_ROWS')).toBe(true)
    expect(rejected.rows).toHaveLength(FORMULA_PASTE_LIMITS.maxMaterialRows + 1)
    const headerAndLimitRows = `Material\tParts\n${Array.from({ length: FORMULA_PASTE_LIMITS.maxMaterialRows }, (_, index) => `M${index}\t1`).join('\n')}`
    expect(validateFormulaPaste(parsedFor(headerAndLimitRows)).readyForApproval).toBe(true)
    const tooManyRawRows = Array.from({ length: FORMULA_PASTE_LIMITS.maxMaterialRows + 2 }, (_, index) => `M${index}\t1`).join('\n')
    expect(parsedFor(tooManyRawRows).issues[0].code).toBe('TOO_MANY_ROWS')
  })

  it('enforces UTF-8 byte size before parsing, including Korean text', () => {
    const text = '가'.repeat(Math.ceil(FORMULA_PASTE_LIMITS.maxTextBytes / 3) + 1)
    expect(parsedFor(text).issues[0].code).toBe('INPUT_TOO_LARGE')
  })

  it('supports safely quoted tabs and escaped quotes but rejects malformed and multiline quotes', () => {
    const result = validateFormulaPaste(parsedFor('"Hedione\tHC"\t1000'), mapping)
    expect(result.rows[0].material).toBe('Hedione\tHC')
    expect(parsedFor('"broken\t100').issues[0].code).toBe('MALFORMED_QUOTING')
    expect(parsedFor('"multi\nline"\t100').issues[0].code).toBe('MULTILINE_QUOTED_CELL')
    expect(parsedFor('Hed"ione\t100').issues[0].code).toBe('MALFORMED_QUOTING')
    expect(validateFormulaPaste(parsedFor('"A ""quoted"" material"\t1000'), mapping).rows[0].material).toBe('A "quoted" material')
  })

  it('preserves row order and deterministic output without mutating parsed input', () => {
    const parsed = parsedFor('Zeta\t600\nAlpha\t400')
    const before = structuredClone(parsed)
    const first = validateFormulaPaste(parsed, mapping)
    const second = validateFormulaPaste(parsed, mapping)
    expect(first).toEqual(second)
    expect(first.rows.map(row => row.material)).toEqual(['Zeta', 'Alpha'])
    expect(parsed).toEqual(before)
  })

  it('does not treat ordinary header words as detected when ambiguous or duplicated', () => {
    expect(detectFormulaPasteColumns(parsedFor('Material\tIngredient\nA\tB')).status).toBe('explicit_required')
    expect(detectFormulaPasteColumns(parsedFor('Material\tParts\tAmount\nA\t1\t2')).status).toBe('explicit_required')
  })
})
