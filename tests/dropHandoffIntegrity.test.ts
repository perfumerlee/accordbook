import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseFormulaFile, importFormula } from '../src/services/formulaFile'
import { toFormulaFile } from '../src/models/formulaFile'
import { createStorage } from '../src/storage/storageService'
const text = readFileSync('public/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook', 'utf8')
describe('Drop handoff normal import integrity', () => {
  it('creates no record at parse time and preserves exact source data on import', async () => {
    const file = parseFormulaFile(text); const storage = await createStorage()
    expect(await storage.formulas.list()).toHaveLength(0)
    const imported = await importFormula(storage, file, 'ACC')
    expect(toFormulaFile(imported).formula).toEqual(file.formula)
    expect(imported.rows.map(r => r.parts)).toEqual([298,190,122,99,46,45,40,25,23,18,94])
    expect(imported.rows.reduce((n,r) => n + Number(r.parts),0)).toBe(1000)
    expect(imported.provenance?.claimedSource).toEqual(file.provenance.claimedSource)
    expect((await storage.formulas.get(imported.id))?.rows).toEqual(imported.rows)
    expect((await importFormula(storage, file, 'ACC')).id).not.toBe(imported.id)
  })
})
