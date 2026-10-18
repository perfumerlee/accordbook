import { describe, expect, it } from 'vitest'
import { parseFormulaPaste, detectFormulaPasteColumns, validateFormulaPaste, validateFormulaPasteEdits } from '../src/services/formulaPasteImport'
import { formulaPasteIssueMessages } from '../src/i18n/messages'

const source = 'Material\tParts\n\tbad\nHedione\t700'
const parsed = parseFormulaPaste(source)
const mapping = detectFormulaPasteColumns(parsed).mapping!

describe('Formula Paste review corrections', () => {
  it('matches Phase 1 results when no edits are supplied', () => {
    expect(validateFormulaPasteEdits(parsed, mapping, {})).toEqual(validateFormulaPaste(parsed, mapping))
  })
  it('corrects missing material and invalid Parts, preserving original cells and row identity', () => {
    const result = validateFormulaPasteEdits(parsed, mapping, { 2: { material: 'Unknown material', partsText: '300' } })
    expect(result.readyForApproval).toBe(true)
    expect(result.totalParts).toBe(1000)
    expect(result.rows[0]).toMatchObject({ sourceRowNumber: 2, originalMaterial: '', originalParts: 'bad', material: 'Unknown material', parts: 300, issues: [] })
    expect(result.rows.map(row => row.sourceRowNumber)).toEqual([2, 3])
  })
  it('adds and removes duplicate warnings as names change without merging rows', () => {
    const duplicate = validateFormulaPasteEdits(parsed, mapping, { 2: { material: 'HEDIONE', partsText: '300' } })
    expect(duplicate.rows).toHaveLength(2)
    expect(duplicate.issues.some(issue => issue.code === 'DUPLICATE_MATERIAL')).toBe(true)
    expect(validateFormulaPasteEdits(parsed, mapping, { 2: { material: 'DPG', partsText: '300' } }).issues.some(issue => issue.code === 'DUPLICATE_MATERIAL')).toBe(false)
  })
  it('recomputes valid-row subtotal, errors, and nonblocking total warnings', () => {
    const invalid = validateFormulaPasteEdits(parsed, mapping, { 2: { material: 'A', partsText: '1.5' } })
    expect(invalid.totalParts).toBe(700)
    expect(invalid.rows[0].issues.some(issue => issue.code === 'PARTS_DECIMAL')).toBe(true)
    expect(invalid.readyForApproval).toBe(false)
    const incomplete = validateFormulaPasteEdits(parsed, mapping, { 2: { material: 'A', partsText: '0' } })
    expect(incomplete.totalParts).toBe(700)
    expect(incomplete.readyForApproval).toBe(true)
    expect(incomplete.issues.some(issue => issue.code === 'TOTAL_NOT_1000')).toBe(true)
  })
  it('does not mutate source, mapping, edits, or previous candidates', () => {
    const before = structuredClone(parsed)
    const candidates = validateFormulaPaste(parsed, mapping)
    const originalCandidates = structuredClone(candidates)
    const edits = Object.freeze({ 2: Object.freeze({ material: 'A', partsText: '300' }) })
    validateFormulaPasteEdits(parsed, Object.freeze(mapping), edits)
    expect(parsed).toEqual(before)
    expect(candidates).toEqual(originalCandidates)
    expect(edits[2].partsText).toBe('300')
  })
  it('does not use display positions to identify rows after blank lines or a header', () => {
    const data = parseFormulaPaste('\nMaterial\tParts\n\nA\t10\nB\t20')
    const result = validateFormulaPasteEdits(data, detectFormulaPasteColumns(data).mapping, { 4: { partsText: '980' }, 999: { material: 'ignored', partsText: '1000' } })
    expect(result.rows.map(row => [row.sourceRowNumber, row.material, row.parts])).toEqual([[4, 'A', 980], [5, 'B', 20]])
    expect(result.totalParts).toBe(1000)
  })
  it('cannot bypass extra-column or row-limit validation through edits', () => {
    const data = parseFormulaPaste('A\t1000\tother')
    const result = validateFormulaPasteEdits(data, { materialColumn: 0, partsColumn: 1 }, { 1: { partsText: '1000' } })
    expect(result.readyForApproval).toBe(false)
    expect(result.issues.some(issue => issue.code === 'UNMAPPED_NONEMPTY_COLUMN')).toBe(true)
    const oversized = parseFormulaPaste(Array.from({ length: 201 }, () => 'A\t1').join('\n'))
    const overLimit = validateFormulaPasteEdits(oversized, { materialColumn: 0, partsColumn: 1 }, { 1: { partsText: '800' } })
    expect(overLimit.readyForApproval).toBe(false)
    expect(overLimit.issues.some(issue => issue.code === 'TOO_MANY_ROWS')).toBe(true)
  })
  it('provides nonempty English and Korean messages for the same issue codes', () => {
    expect(Object.keys(formulaPasteIssueMessages.ko).sort()).toEqual(Object.keys(formulaPasteIssueMessages.en).sort())
    for (const message of [...Object.values(formulaPasteIssueMessages.en), ...Object.values(formulaPasteIssueMessages.ko)]) expect(message.trim().length).toBeGreaterThan(0)
  })
})
