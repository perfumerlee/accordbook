import { ArchiveRepository } from './archiveRepository'
import { FormulaRepository } from './formulaRepository'
import { MetaRepository } from './metaRepository'
import { openDatabase, type StorageMode } from './database'
import { SettingsRepository } from './settingsRepository'
import type { Formula } from '../models/formula'

export type AutosaveStatus = 'saving' | 'saved-locally' | 'session-only'

export interface AccordbookStorage {
  mode: StorageMode
  formulas: FormulaRepository
  archive: ArchiveRepository
  settings: SettingsRepository
  meta: MetaRepository
  saveFormula(formula: Formula): Promise<AutosaveStatus>
}

export async function createStorage(): Promise<AccordbookStorage> {
  const database = await openDatabase()
  const formulas = new FormulaRepository(database)
  return {
    mode: database.mode,
    formulas,
    archive: new ArchiveRepository(database),
    settings: new SettingsRepository(database),
    meta: new MetaRepository(database),
    async saveFormula(formula) {
      try {
        await formulas.save(formula)
        return database.mode === 'indexeddb' ? 'saved-locally' : 'session-only'
      } catch {
        return 'session-only'
      }
    },
  }
}
