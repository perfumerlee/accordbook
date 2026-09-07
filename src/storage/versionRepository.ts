import type { Formula, FormulaVersion } from '../models/formula'
import type { StorageDatabase } from './database'

export class VersionRepository {
  constructor(private readonly database: StorageDatabase) {}
  save(version: FormulaVersion): Promise<void> { return this.database.put('versions', version.versionId, JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async get(versionId: string): Promise<FormulaVersion | undefined> { const value = await this.database.get<FormulaVersion>('versions', versionId); return value ? JSON.parse(JSON.stringify(value)) as FormulaVersion : undefined }
  async listByParentFormulaId(parentFormulaId: string): Promise<FormulaVersion[]> { return (await this.database.getAll<FormulaVersion>('versions')).filter((version) => version.parentFormulaId === parentFormulaId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((version) => JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async listAll(): Promise<FormulaVersion[]> { return (await this.database.getAll<FormulaVersion>('versions')).map((version) => JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async deleteByParentFormulaId(parentFormulaId: string): Promise<void> {
    const versions = await this.listByParentFormulaId(parentFormulaId)
    for (const version of versions) await this.assertNotReleased(version)
    for (const version of versions) await this.database.delete('versions', version.versionId)
  }
  private async assertNotReleased(version: FormulaVersion): Promise<void> {
    const active = await this.database.get<Formula>('formulas', version.parentFormulaId)
    const archived = await this.database.get<Formula>('archive', version.parentFormulaId)
    if ([active, archived].some(formula => formula?.releasedVersionId === version.versionId)) {
      throw new Error('This is the released version. Mark another version as the release before deleting this version.')
    }
  }
  async delete(versionId: string): Promise<void> {
    const version = await this.get(versionId)
    if (version) await this.assertNotReleased(version)
    await this.database.delete('versions', versionId)
  }
}
