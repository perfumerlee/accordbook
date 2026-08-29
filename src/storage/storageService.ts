import { ArchiveRepository } from './archiveRepository'
import { FormulaRepository } from './formulaRepository'
import { MetaRepository } from './metaRepository'
import { openDatabase, type StorageMode } from './database'
import { SettingsRepository } from './settingsRepository'
import { IfraRepository } from './ifraRepository'
import { NaturalContributionRepository } from './naturalContributionRepository'
import type { Formula } from '../models/formula'
import type { AccordbookBackupData } from '../models/backup'

export type AutosaveStatus = 'saving' | 'saved-locally' | 'session-only'

export interface AccordbookStorage {
  mode: StorageMode
  formulas: FormulaRepository
  archive: ArchiveRepository
  settings: SettingsRepository
  meta: MetaRepository
  ifra: IfraRepository
  naturalContributions: NaturalContributionRepository
  saveFormula(formula: Formula): Promise<AutosaveStatus>
  exportData(): Promise<AccordbookBackupData>
  importData(data: AccordbookBackupData): Promise<void>
}

export async function createStorage(): Promise<AccordbookStorage> {
  const database = await openDatabase()
  const formulas = new FormulaRepository(database)
  const ifra = new IfraRepository(database)
  const naturalContributions = new NaturalContributionRepository(database)
  return {
    mode: database.mode,
    formulas,
    archive: new ArchiveRepository(database),
    settings: new SettingsRepository(database),
    meta: new MetaRepository(database),
    ifra,
    naturalContributions,
    async saveFormula(formula) {
      try {
        await formulas.save(formula)
        return database.mode === 'indexeddb' ? 'saved-locally' : 'session-only'
      } catch {
        return 'session-only'
      }
    },
    async exportData() { return { settings: (await database.get('settings', 'current')) ?? { formulaIdPrefix: 'ACC', language: 'en' }, formulas: await formulas.list(), archive: await (new ArchiveRepository(database)).list(), meta: await (new MetaRepository(database)).getAll(), ifraMaterials: await ifra.get(), naturalContributions: await naturalContributions.get() } },
    async importData(data) { await database.replaceAll(data) },
  }
}
