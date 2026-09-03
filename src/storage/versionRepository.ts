import type { FormulaVersion } from '../models/formula'
import type { StorageDatabase } from './database'

export class VersionRepository {
  constructor(private readonly database: StorageDatabase) {}
  save(version: FormulaVersion): Promise<void> { return this.database.put('versions', version.versionId, JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async get(versionId: string): Promise<FormulaVersion | undefined> { const value = await this.database.get<FormulaVersion>('versions', versionId); return value ? JSON.parse(JSON.stringify(value)) as FormulaVersion : undefined }
  async listByParentFormulaId(parentFormulaId: string): Promise<FormulaVersion[]> { return (await this.database.getAll<FormulaVersion>('versions')).filter((version) => version.parentFormulaId === parentFormulaId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((version) => JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async listAll(): Promise<FormulaVersion[]> { return (await this.database.getAll<FormulaVersion>('versions')).map((version) => JSON.parse(JSON.stringify(version)) as FormulaVersion) }
  async deleteByParentFormulaId(parentFormulaId: string): Promise<void> { for (const version of await this.listByParentFormulaId(parentFormulaId)) await this.database.delete('versions', version.versionId) }
  delete(versionId: string): Promise<void> { return this.database.delete('versions', versionId) }
}
