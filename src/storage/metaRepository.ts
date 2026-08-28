import type { StorageDatabase } from './database'

export class MetaRepository {
  constructor(private readonly database: StorageDatabase) {}

  getSequence(sequenceKey: string): Promise<number | undefined> { return this.database.get<number>('meta', sequenceKey) }
  setSequence(sequenceKey: string, sequence: number): Promise<void> { return this.database.put('meta', sequenceKey, sequence) }
}
