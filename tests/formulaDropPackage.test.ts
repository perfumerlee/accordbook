import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFormulaFile } from '../src/services/formulaFile'
import { parseFreeFormulaDropPackage, validateFormulaDropId } from '../src/services/formulaDropPackage'

const source = JSON.parse(readFileSync('public/formula-drops/2026-001/source.json', 'utf8'))
const text = readFileSync('public/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook', 'utf8')
const expected = source.rows.map((row: { material: string; parts: number }) => [row.material, row.parts])
describe('authoritative free Formula Drop package', () => {
  it('matches the repository source of truth exactly', () => {
    const parsed = parseFormulaFile(text); const rows = parsed.formula.rows.map(row => [row.material, row.parts]);
    expect(parsed.formula.name).toBe(source.title); expect(rows).toEqual(expected); expect(rows.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(1000); expect(rows.some(row => row[1] === 1)).toBe(false)
  })
  it('round-trips through the free package boundary', () => { const result = parseFreeFormulaDropPackage('DROP-2026-001', text, 'DROP.accordbook', source.title); expect(result.packageType).toBe('accordbook-formula'); expect(JSON.parse(result.packageText).provenance.claimedSource.title).toContain('DROP-2026-001') })
  it('rejects invalid IDs and paid packages', () => { expect(validateFormulaDropId('DROP-2026-001')).toBe(true); expect(validateFormulaDropId('../package')).toBe(false); expect(() => parseFreeFormulaDropPackage('DROP-2026-001', '{"type":"accordbook-paid-package"}', 'x.accordbook', source.title)).toThrow('invalid_drop_package') })
})
