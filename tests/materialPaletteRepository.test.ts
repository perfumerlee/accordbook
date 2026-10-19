import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createMemoryStorage, openDatabase, type StorageDatabase } from '../src/storage/database'
import { MaterialPaletteRepository } from '../src/storage/materialPaletteRepository'

for (const mode of ['memory', 'indexeddb'] as const) describe(`Material Palette bulk removal: ${mode}`, () => {
  let database: StorageDatabase
  let repository: MaterialPaletteRepository

  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    database = mode === 'memory' ? createMemoryStorage() : await openDatabase()
    expect(database.mode).toBe(mode)
    repository = new MaterialPaletteRepository(database)
  })

  it('removes only the selected records in one operation', async () => {
    const records = await repository.addAtomic([
      { materialName: 'Lime' },
      { materialName: 'Benzyl Benzoate' },
      { materialName: 'Triplal' },
    ])

    await repository.removeMany([records[0].materialId, records[2].materialId, 'missing-id'])

    expect((await repository.list()).map(item => item.materialName)).toEqual(['Benzyl Benzoate'])
  })

  it('clears all Palette records without touching other stores', async () => {
    await repository.addAtomic([{ materialName: 'Lime' }, { materialName: 'Hedione' }])
    await database.put('settings', 'current', { formulaIdPrefix: 'ACC', language: 'en' })

    await repository.removeAll()

    expect(await repository.list()).toEqual([])
    expect(await database.get('settings', 'current')).toEqual({ formulaIdPrefix: 'ACC', language: 'en' })
  })
})
