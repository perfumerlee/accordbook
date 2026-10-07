import { ArchiveRepository } from './archiveRepository'
import { FormulaRepository } from './formulaRepository'
import { MetaRepository } from './metaRepository'
import { openDatabase, type StorageMode } from './database'
import { SettingsRepository } from './settingsRepository'
import type { Formula } from '../models/formula'
import type { AccordbookBackupData } from '../models/backup'
import { VersionRepository } from './versionRepository'
import { ExperimentRepository } from './experimentRepository'
import { WorkspaceRepository } from './workspaceRepository'
import { AiReviewRepository } from './aiReviewRepository'

export type AutosaveStatus = 'saving' | 'saved-locally' | 'session-only'

export interface AccordbookStorage {
  mode: StorageMode
  formulas: FormulaRepository
  archive: ArchiveRepository
  settings: SettingsRepository
  meta: MetaRepository
  versions: VersionRepository
  experiments: ExperimentRepository
  reviews: AiReviewRepository
  workspaces: WorkspaceRepository
  saveFormula(formula: Formula): Promise<AutosaveStatus>
  exportData(): Promise<AccordbookBackupData>
  importData(data: AccordbookBackupData, options?: { preserveExperimentReviews?: boolean }): Promise<void>
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
    versions: new VersionRepository(database),
    experiments: new ExperimentRepository(database),
    reviews: new AiReviewRepository(database),
    workspaces: new WorkspaceRepository(database),
    async saveFormula(formula) {
      try {
        await formulas.save(formula)
        return database.mode === 'indexeddb' ? 'saved-locally' : 'session-only'
      } catch {
        return 'session-only'
      }
    },
    async exportData() { const reviews = new AiReviewRepository(database); return { settings: (await database.get('settings', 'current')) ?? { formulaIdPrefix: 'ACC', language: 'en' }, formulas: await formulas.list(), archive: await (new ArchiveRepository(database)).list(), versions: await database.getAll('versions'), experiments: await (new ExperimentRepository(database)).list(), reviews: [...await reviews.listAll(), ...await reviews.listAllExperimentReviews()], meta: await (new MetaRepository(database)).getAll() } },
    async importData(data, options) { await database.replaceAll(data, options) },
  }
}
