import type { Formula, FormulaVersion } from '../models/formula'
import { validateReleaseTarget } from '../services/formulaRelease'
import type { StorageDatabase } from './database'

export class FormulaRepository {
  constructor(private readonly database: StorageDatabase) {}

  async save(formula: Formula): Promise<void> {
    const current = await this.get(formula.id)
    // Content autosaves may have been queued before a release was designated.
    const releasedVersionId = current?.releasedVersionId ?? formula.releasedVersionId
    return this.database.put('formulas', formula.id, { ...formula, ...(releasedVersionId ? { releasedVersionId } : {}), updatedAt: new Date().toISOString() })
  }
  get(id: string): Promise<Formula | undefined> { return this.database.get<Formula>('formulas', id) }
  async markReleasedVersion(id: string, versionId: string): Promise<Formula> {
    const formula = await this.get(id)
    if (!formula) throw new Error('Formula no longer exists.')
    const version = await this.database.get<FormulaVersion>('versions', versionId)
    validateReleaseTarget(formula, version)
    const released = { ...formula, releasedVersionId: version.versionId }
    await this.database.put('formulas', id, released)
    return released
  }
  async removeReleasedVersion(id: string): Promise<Formula> {
    const formula = await this.get(id)
    if (!formula) throw new Error('Formula no longer exists.')
    const { releasedVersionId: _releasedVersionId, ...cleared } = formula
    await this.database.put('formulas', id, cleared)
    return cleared
  }
  list(): Promise<Formula[]> { return this.database.getAll<Formula>('formulas') }
  remove(id: string): Promise<void> { return this.database.delete('formulas', id) }

  async moveToArchive(formula: Formula): Promise<void> {
    await this.database.put('archive', formula.id, { ...formula, archivedAt: new Date().toISOString() })
    await this.remove(formula.id)
  }
}
