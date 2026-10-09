import type { MaterialPaletteInput, MaterialPaletteRecord } from '../models/materialPalette'
import { createPaletteRecord } from '../services/materialPalette'
import type { StorageDatabase } from './database'

export class MaterialPaletteRepository {
  constructor(private readonly database: StorageDatabase) {}
  async list(): Promise<MaterialPaletteRecord[]> { return structuredClone(await this.database.getAll<MaterialPaletteRecord>('palette')) }
  async get(id: string): Promise<MaterialPaletteRecord | undefined> { return structuredClone(await this.database.get<MaterialPaletteRecord>('palette', id)) }
  async add(input: MaterialPaletteInput) { const record = createPaletteRecord(input); await this.database.writePaletteAtomic([record], 'add'); return record }
  async update(id: string, input: MaterialPaletteInput) { const previous = await this.get(id); if (!previous) throw new Error('Material no longer exists'); const record = createPaletteRecord(input, previous); await this.database.writePaletteAtomic([record], 'update'); return record }
  async remove(id: string) { await this.database.delete('palette', id) }
  async addAtomic(inputs: readonly MaterialPaletteInput[]) { const records = inputs.map(input => createPaletteRecord(input)); await this.database.writePaletteAtomic(records, 'add'); return records }
  async addFromFormulaAtomic(inputs: readonly MaterialPaletteInput[]) { const records = inputs.map(input => createPaletteRecord(input)); await this.database.writePaletteAtomic(records, 'add-formula'); return records }
  async replaceAtomic(records: MaterialPaletteRecord[]) { await this.database.writePaletteAtomic(records, 'replace') }
}
