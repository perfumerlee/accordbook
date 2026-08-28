import type { Formula } from '../models/formula'
import type { StorageDatabase } from './database'

export class FormulaRepository {
  constructor(private readonly database: StorageDatabase) {}

  save(formula: Formula): Promise<void> {
    return this.database.put('formulas', formula.id, { ...formula, updatedAt: new Date().toISOString() })
  }
  get(id: string): Promise<Formula | undefined> { return this.database.get<Formula>('formulas', id) }
  list(): Promise<Formula[]> { return this.database.getAll<Formula>('formulas') }
  remove(id: string): Promise<void> { return this.database.delete('formulas', id) }

  async moveToArchive(formula: Formula): Promise<void> {
    await this.database.put('archive', formula.id, { ...formula, archivedAt: new Date().toISOString() })
    await this.remove(formula.id)
  }
}
