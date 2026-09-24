import { expect, it } from 'vitest'
import { normalizeFormulaDropOrigin } from '../src/services/formulaDropOrigin'
import { importFormula, parseFormulaFile } from '../src/services/formulaFile'
import { createStorage } from '../src/storage/storageService'
import type { ClaimedSource } from '../src/models/formula'

const legacy: ClaimedSource = { originType: 'reference', title: 'Formula Drop · DROP-2026-001', note: 'Free Formula Drop package; source fixture: public/formula-drops/2026-001/source.json' }

it('normalizes the shipped note for existing UI data without mutating stored history', () => {
  expect(normalizeFormulaDropOrigin(legacy).note).toBe('A public Formula Drop reference.')
  expect(legacy.note).toContain('source fixture:')
  const edited = { ...legacy, note: 'My own reference notes' }
  expect(normalizeFormulaDropOrigin(edited)).toBe(edited)
  const other = { ...legacy, title: 'Another reference' }
  expect(normalizeFormulaDropOrigin(other)).toBe(other)
})

it('persists clean Origin when importing an old downloaded or server-provided package', async () => {
  const storage = await createStorage()
  const file = parseFormulaFile(JSON.stringify({ type: 'accordbook-formula', formatVersion: 2, formula: { name: 'Apple', notes: 'Study notes', rows: [] }, provenance: { claimedSource: legacy } }))
  const imported = await importFormula(storage, file, 'ACC')
  const saved = await storage.formulas.get(imported.id)
  expect(saved?.provenance?.claimedSource).toEqual({ ...legacy, note: 'A public Formula Drop reference.' })
  expect(saved?.notes).toBe('Study notes')
})
