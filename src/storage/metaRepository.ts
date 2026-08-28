import type { StorageDatabase } from './database'

export class MetaRepository {
  constructor(private readonly database: StorageDatabase) {}

  getSequence(sequenceKey: string): Promise<number | undefined> { return this.database.get<number>('meta', sequenceKey) }
  setSequence(sequenceKey: string, sequence: number): Promise<void> { return this.database.put('meta', sequenceKey, sequence) }
  async getAll(): Promise<Record<string, number>> { const entries = await this.database.entries('meta'); return Object.fromEntries(entries.filter((entry): entry is [string, number] => typeof entry[1] === 'number')) }
}
