import type { NaturalContributionDataset } from '../models/naturalContribution'
import type { StorageDatabase } from './database'

const KEY = 'current'

export class NaturalContributionRepository {
  constructor(private readonly database: StorageDatabase) {}

  get(): Promise<NaturalContributionDataset | undefined> { return this.database.get<NaturalContributionDataset>('naturalContributions', KEY) }
  save(dataset: NaturalContributionDataset): Promise<void> { return this.database.put('naturalContributions', KEY, dataset) }
}
