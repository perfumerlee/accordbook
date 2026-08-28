import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import type { AccordbookSettings } from '../src/models/settings'
import { createMemoryStorage } from '../src/storage/database'
import { ArchiveRepository } from '../src/storage/archiveRepository'
import { FormulaRepository } from '../src/storage/formulaRepository'
import { MetaRepository } from '../src/storage/metaRepository'
import { SettingsRepository } from '../src/storage/settingsRepository'
import { generateFormulaId } from '../src/services/formulaIdGenerator'
import { createStorage } from '../src/storage/storageService'

const formula = (): Formula => ({
  id: 'local-1', formulaId: 'ACC-2608-001', date: '2026-08-28', name: 'Test', notes: 'note',
  rows: [{ id: 'row-1', parts: 100, material: 'DPG', marked: true, dilution: { enabled: true, percent: 10, solvent: 'ALC' } }],
  createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
})

describe('storage repositories', () => {
  it('saves and reads formulas, updating updatedAt on changes', async () => {
    const repository = new FormulaRepository(createMemoryStorage())
    await repository.save(formula())
    const saved = await repository.get('local-1')
    expect(saved?.rows[0].dilution?.percent).toBe(10)
    expect(saved?.updatedAt).not.toBe('2026-08-28T00:00:00.000Z')
  })

  it('persists settings and supports moving formulas to archive', async () => {
    const database = createMemoryStorage()
    const formulas = new FormulaRepository(database)
    const archive = new ArchiveRepository(database)
    const settings = new SettingsRepository(database)
    const value: AccordbookSettings = { formulaIdPrefix: 'LAB', language: 'ko' }
    await settings.save(value)
    await formulas.save(formula())
    await formulas.moveToArchive((await formulas.get('local-1'))!)
    expect(await settings.get()).toEqual(value)
    expect(await formulas.get('local-1')).toBeUndefined()
    expect((await archive.get('local-1'))?.archivedAt).toBeDefined()
  })

  it('keeps sequence history after a formula is deleted', async () => {
    const meta = new MetaRepository(createMemoryStorage())
    const date = new Date(2026, 7, 28)
    expect(await generateFormulaId({ prefix: 'ACC', date }, meta)).toBe('ACC-2608-001')
    expect(await generateFormulaId({ prefix: 'ACC', date }, meta)).toBe('ACC-2608-002')
    await meta.setSequence('ACC-2608', 3)
    expect(await generateFormulaId({ prefix: 'ACC', date }, meta)).toBe('ACC-2608-004')
  })

  it('works with session-only storage when IndexedDB is unavailable', async () => {
    const storage = await createStorage()
    expect(['indexeddb', 'memory']).toContain(storage.mode)
    expect(await storage.saveFormula(formula())).toBe(storage.mode === 'indexeddb' ? 'saved-locally' : 'session-only')
    expect(await storage.formulas.get('local-1')).toBeDefined()
  })
})
