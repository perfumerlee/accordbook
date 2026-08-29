export interface NaturalContributionEntry {
  ncsCas: string
  ncsName: string
  constituentCas: string
  constituentName: string
  percent: number
}

export interface NaturalContributionDataset {
  importedAt: string
  entries: NaturalContributionEntry[]
}
