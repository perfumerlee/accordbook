import type { Formula } from '../models/formula'
import type { StorageDatabase } from './database'

export class ArchiveRepository {
  constructor(private readonly database: StorageDatabase) {}

  list(): Promise<Formula[]> { return this.database.getAll<Formula>('archive') }
  get(id: string): Promise<Formula | undefined> { return this.database.get<Formula>('archive', id) }

  async restore(formula: Formula): Promise<void> {
    const { archivedAt: _archivedAt, ...activeFormula } = formula
    await this.database.put('formulas', formula.id, activeFormula)
    await this.database.delete('archive', formula.id)
  }

  deletePermanently(id: string): Promise<void> { return this.database.delete('archive', id) }
}
