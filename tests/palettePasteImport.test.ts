import { describe, it, expect } from 'vitest'
import { preparePalettePaste, reviewPalettePaste } from '../src/services/palettePasteImport'
import { createPaletteRecord } from '../src/services/materialPalette'

describe('Palette paste mapping and approval', () => {
  it('recognizes the supplied Korean material / CAS Number table in either column order', () => {
    const { rows, mapping } = preparePalettePaste('CAS Number\t원료명\n8007-75-8\tBergamot')
    expect(mapping).toEqual({ header: true, columns: ['cas', 'materialName'] })
    expect(reviewPalettePaste(rows, mapping, []).rows[0].input).toEqual({ materialName: 'Bergamot', cas: '8007-75-8' })
  })
  it('maps all details aliases and treats a percentage as percentage points', () => {
    const { rows, mapping } = preparePalettePaste('향료명\t별칭\tCAS / Ref.\t희석률\t용매\t비고\nA\tB\tref\t10%\tALC\t메모')
    expect(reviewPalettePaste(rows, mapping, []).rows[0].input).toEqual({ materialName: 'A', alias: 'B', cas: 'ref', dilution: { percent: 10, solvent: 'ALC' }, notes: '메모' })
  })
  it('allows manual headerless mapping and requires unknown columns to be excluded explicitly', () => {
    const { rows, mapping } = preparePalettePaste('Bergamot\t8007-75-8\t17\nLime\t8008-26-2\t18')
    expect(mapping.header).toBe(false)
    expect(() => reviewPalettePaste(rows, mapping, [])).toThrow('Map or exclude')
    const result = reviewPalettePaste(rows, { header: false, columns: ['materialName', 'cas', 'ignore'] }, [])
    expect(result.rows.map(row => row.input?.materialName)).toEqual(['Bergamot', 'Lime'])
    expect(result.unsupportedColumns).toEqual(['Column 3'])
  })
  it('does not guess duplicate aliases or permit two source columns for one field', () => {
    const { rows, mapping } = preparePalettePaste('원료명\tMaterial Name\nA\tB')
    expect(mapping.columns).toEqual(['unmapped', 'unmapped'])
    expect(() => reviewPalettePaste(rows, { header: true, columns: ['materialName', 'materialName'] }, [])).toThrow('only once')
  })
  it('keeps the original by default and rechecks duplicates after explicit dilution approval', () => {
    const { rows, mapping } = preparePalettePaste('원료명\tCAS Number\nBenzoin Resinoid @50% in DPG\t9000-72-0')
    const palette = [createPaletteRecord({ materialName: 'Benzoin Resinoid' })]
    const unchanged = reviewPalettePaste(rows, mapping, palette)
    expect(unchanged.errors).toBe(0)
    expect(unchanged.rows[0].input).toEqual({ materialName: 'Benzoin Resinoid @50% in DPG', cas: '9000-72-0' })
    const kept = reviewPalettePaste(rows, mapping, palette, { 2: { mode: 'keep_original' } })
    expect(kept.rows[0].input?.materialName).toBe('Benzoin Resinoid @50% in DPG')
    expect(kept.rows[0].input?.dilution).toBeUndefined()
    const applied = reviewPalettePaste(rows, mapping, palette, { 2: { mode: 'apply', material: 'Benzoin Resinoid', percentInput: '50', solventInput: 'DPG' } })
    expect(applied.duplicates).toBe(1)
    expect(applied.rows[0].input).toEqual({ materialName: 'Benzoin Resinoid', cas: '9000-72-0', dilution: { percent: 50, solvent: 'DPG' } })
  })
  it('surfaces column conflicts and requires a solvent for applying a proposal', () => {
    const { rows, mapping } = preparePalettePaste('Material Name\tDilution %\tSolvent\nA @10%\t20\tDPG')
    expect(reviewPalettePaste(rows, mapping, []).rows[0].conflict).toBe(true)
    expect(reviewPalettePaste(rows, mapping, [], { 2: { mode: 'apply', material: 'A', percentInput: '10', solventInput: '' } }).errors).toBe(1)
    expect(reviewPalettePaste(rows, mapping, [], { 2: { mode: 'keep_original' } }).rows[0].input?.dilution).toEqual({ percent: 20, solvent: 'DPG' })
    expect(reviewPalettePaste(rows, mapping, [], { 2: { mode: 'apply', material: 'A', percentInput: '0', solventInput: 'ALC' } }).errors).toBe(1)
  })
})
