import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { PALETTE_FILENAME, PALETTE_SAMPLE_FILENAME, PALETTE_HEADERS, PALETTE_SAMPLE, PALETTE_SHEET, readPaletteExcel, writePaletteExcel } from '../src/services/materialPaletteExcel'
import { createPaletteRecord } from '../src/services/materialPalette'
async function workbook(headers: unknown[] = [...PALETTE_HEADERS], row: unknown[] = ['A'], name = PALETTE_SHEET) { const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet(name); sheet.addRow(headers); sheet.addRow(row); return new Uint8Array(await book.xlsx.writeBuffer()).buffer }
describe('Palette XLSX', () => {
  it('writes sample with exact schema and imports it through the production reader', async () => {
    expect(PALETTE_SAMPLE_FILENAME).toBe('Accordbook-Material-Palette-Sample.xlsx'); expect(PALETTE_FILENAME).toBe('Accordbook-Material-Palette.xlsx')
    const bytes = await writePaletteExcel(PALETTE_SAMPLE), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes)
    const sheet = book.getWorksheet(PALETTE_SHEET)!; expect(sheet.getRow(1).values).toEqual([, ...PALETTE_HEADERS])
    const preview = await readPaletteExcel(bytes, []); expect(preview.errors).toBe(0); expect(preview.totalRows).toBe(8); expect(preview.rows.find(row => row.input?.materialName === 'Ambroxan')?.input?.dilution).toEqual({ percent: 10, solvent: 'DPG' })
    expect(preview.rows.every(row => !row.input?.cas)).toBe(true)
  })
  it('round trips user fields, excludes internal metadata and never creates formulas', async () => {
    const item = createPaletteRecord({ materialName: '=1+1', alias: 'Alias', cas: 'ref', notes: 'notes', dilution: { percent: 10, solvent: 'DPG' } }), bytes = await writePaletteExcel([item]), book = new ExcelJS.Workbook(); await book.xlsx.load(bytes)
    expect(book.getWorksheet(PALETTE_SHEET)!.getCell('A2').value).toBe('=1+1')
    const preview = await readPaletteExcel(bytes, []); expect(preview.rows[0].input).toEqual({ materialName: '=1+1', alias: 'Alias', cas: 'ref', notes: 'notes', dilution: { percent: 10, solvent: 'DPG' } })
    expect(JSON.stringify(book.model)).not.toContain(item.materialId)
  })
  it('rejects malformed, wrong sheet, required/duplicate headers', async () => {
    await expect(readPaletteExcel(new Uint8Array([1, 2]).buffer, [])).rejects.toThrow()
    await expect(readPaletteExcel(await workbook(undefined, undefined, 'Wrong'), [])).rejects.toThrow()
    await expect(readPaletteExcel(await workbook(['Alias']), [])).rejects.toThrow()
    await expect(readPaletteExcel(await workbook(['Material Name', 'Material Name']), [])).rejects.toThrow()
  })
  it('shows invalid dilution, unknown columns and duplicate conflicts', async () => {
    const invalid = await readPaletteExcel(await workbook(undefined, ['A', '', '', 101]), []); expect(invalid.errors).toBe(1)
    const preview = await readPaletteExcel(await workbook([...PALETTE_HEADERS, 'Unsupported'], ['A', '', '2']), [createPaletteRecord({ materialName: 'a', cas: '1' })]); expect(preview.unsupportedColumns).toEqual(['Unsupported']); expect(preview.duplicates).toBe(1); expect(preview.rows[0].messages).toContain('Conflicting CAS / CAS 불일치')
  })
  it('rejects computed Formula cells and ignores empty rows', async () => {
    const preview = await readPaletteExcel(await workbook(undefined, [{ formula: '1+1', result: 'A' }]), []); expect(preview.errors).toBe(1)
    const blank = await readPaletteExcel(await workbook(undefined, []), []); expect(blank.totalRows).toBe(0)
  })
})
