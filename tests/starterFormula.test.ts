import { describe, expect, it } from 'vitest'
import { starterFormulas } from '../src/data/starterFormulas'
import { createStorage } from '../src/storage/storageService'
import { createStarterFormula } from '../src/services/starterFormulaLifecycle'
import { duplicateFormula } from '../src/services/formulaLifecycle'
import { sortArchivedFormulas, sortNotebookFormulas } from '../src/services/formulaOrdering'

describe('starter formulas', () => {
  it('contains three complete 1,000-part templates', () => {
    expect(starterFormulas).toHaveLength(3)
    for (const starter of starterFormulas) {
      expect(starter.materials.reduce((total, material) => total + material.parts, 0)).toBe(1000)
    }
  })

  it('creates independent ordinary Formulas with sample Origin and no Versions', async () => {
    const storage = await createStorage(); const first = await createStarterFormula(storage, 'ACC', starterFormulas[0]); const second = await createStarterFormula(storage, 'ACC', starterFormulas[0])
    expect(first.id).not.toBe(second.id); expect(first.formulaId).not.toBe(second.formulaId); expect(first.provenance?.claimedSource).toEqual({ originType: 'adapted_from', title: 'Accordbook Sample · Simple Citrus Study' }); expect((await storage.versions.listByParentFormulaId(first.id))).toHaveLength(0)
    first.rows[0].parts = 1; expect(second.rows[0].parts).not.toBe(1); expect(first.rows.every((row) => row.rowId)).toBe(true)
  })

  it('records only the direct parent when duplicating a Formula', async () => {
    const storage = await createStorage(); const source = await createStarterFormula(storage, 'ACC', starterFormulas[0]); const copy = await duplicateFormula(storage, source, 'ACC'); const grandchild = await duplicateFormula(storage, copy, 'ACC')
    expect(copy.provenance?.claimedSource).toEqual({ originType: 'adapted_from', title: source.formulaId }); expect(grandchild.provenance?.claimedSource).toEqual({ originType: 'adapted_from', title: copy.formulaId })
  })

  it('sorts Notebook by createdAt and Archive by archivedAt, not updatedAt', () => {
    const make = (id: string, createdAt: string, archivedAt?: string) => ({ id, formulaId: id, date: '', name: '', notes: '', rows: [], createdAt, updatedAt: '9999', archivedAt })
    const old = make('a', '2026-01-01'); const middle = make('b', '2026-02-01'); const newest = make('c', '2026-03-01')
    expect(sortNotebookFormulas([old, newest, middle]).map((item) => item.id)).toEqual(['c', 'b', 'a'])
    expect(sortNotebookFormulas([old, middle, newest].map((item) => ({ ...item, updatedAt: '9999' }))).map((item) => item.id)).toEqual(['c', 'b', 'a'])
    expect(sortArchivedFormulas([make('a', '2026-03-01', '2026-01-01'), make('b', '2026-01-01', '2026-03-01')]).map((item) => item.id)).toEqual(['b', 'a'])
  })
})
