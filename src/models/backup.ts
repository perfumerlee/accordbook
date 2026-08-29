import type { Formula } from './formula'
import type { AccordbookSettings } from './settings'
import type { IfraDataset } from './ifra'
import type { NaturalContributionDataset } from './naturalContribution'

export interface AccordbookBackupData {
  settings: AccordbookSettings
  formulas: Formula[]
  archive: Formula[]
  meta: Record<string, number>
  ifraMaterials?: IfraDataset
  naturalContributions?: NaturalContributionDataset
}

export interface AccordbookBackup {
  app: 'Accordbook'
  formatVersion: 1
  exportedAt: string
  data: AccordbookBackupData
}
