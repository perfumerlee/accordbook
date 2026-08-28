import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { createMemoryStorage } from '../src/storage/database'
import { createStorage } from '../src/storage/storageService'
import { archiveFormula, createFormula, deleteArchivedFormula, duplicateFormula, resetMaterials, restoreFormula } from '../src/services/formulaLifecycle'

const source: Formula = { id: 'source', formulaId: 'ACC-2608-001', date: '2026-08-28', name: 'Jasmine Study', notes: 'test notes', rows: [{ id: 'r1', parts: 15, material: 'Indole', marked: true, dilution: { enabled: true, percent: 10, solvent: 'ALC' } }], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' }

describe('formula lifecycle', () => {
  it('creates a new active formula with a sequence ID and one empty row', async () => { const storage = await createStorage(); const result = await createFormula(storage); expect(result.formulaId).toMatch(/-\d{3}$/); expect(result.rows).toHaveLength(1); expect(result.rows[0].material).toBe('') })
  it('duplicates content but creates new identity and ID', async () => { const storage = await createStorage(); await storage.meta.setSequence('ACC-2608', 1); const result = await duplicateFormula(storage, source); expect(result.id).not.toBe(source.id); expect(result.formulaId).not.toBe(source.formulaId); expect(result.notes).toBe(source.notes); expect(result.rows[0].dilution).toEqual(source.rows[0].dilution); expect(result.rows[0].id).not.toBe(source.rows[0].id) })
  it('resets only material rows', () => { const result = resetMaterials(source); expect(result.formulaId).toBe(source.formulaId); expect(result.name).toBe(source.name); expect(result.notes).toBe(source.notes); expect(result.rows).toHaveLength(1); expect(result.rows[0].material).toBe('') })
  it('moves, restores, and permanently deletes archive records without changing IDs', async () => { const storage = await createStorage(); await storage.formulas.save(source); await archiveFormula(storage, source); expect(await storage.formulas.get(source.id)).toBeUndefined(); const archived = await storage.archive.get(source.id); expect(archived?.archivedAt).toBeDefined(); await restoreFormula(storage, archived!); expect((await storage.formulas.get(source.id))?.formulaId).toBe(source.formulaId); await archiveFormula(storage, source); await deleteArchivedFormula(storage, source.id); expect(await storage.archive.get(source.id)).toBeUndefined() })
  it('preserves sequence history after permanent deletion', async () => { const storage = await createStorage(); await storage.meta.setSequence('ACC-2608', 7); await deleteArchivedFormula(storage, 'missing'); expect(await storage.meta.getSequence('ACC-2608')).toBe(7) })
})
