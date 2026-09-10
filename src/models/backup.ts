import type { Formula, FormulaVersion } from './formula'
import type { AccordbookSettings } from './settings'
import type { Experiment } from './experiment'

export interface AccordbookBackupData {
  settings: AccordbookSettings
  formulas: Formula[]
  archive: Formula[]
  versions?: FormulaVersion[]
  experiments?: Experiment[]
  meta: Record<string, number>
}

export interface AccordbookBackup {
  app: 'Accordbook'
  formatVersion: 3
  exportedAt: string
  data: AccordbookBackupData
}
