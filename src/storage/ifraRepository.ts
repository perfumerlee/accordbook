import type { IfraDataset } from '../models/ifra'
import type { StorageDatabase } from './database'

const IFRA_KEY = 'current'

export class IfraRepository {
  constructor(private readonly database: StorageDatabase) {}

  get(): Promise<IfraDataset | undefined> { return this.database.get<IfraDataset>('ifraMaterials', IFRA_KEY) }
  save(dataset: IfraDataset): Promise<void> { return this.database.put('ifraMaterials', IFRA_KEY, dataset) }
}
