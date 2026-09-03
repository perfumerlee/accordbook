import type { Formula, FormulaVersion } from './formula'
import type { AccordbookSettings } from './settings'

export interface AccordbookBackupData {
  settings: AccordbookSettings
  formulas: Formula[]
  archive: Formula[]
  versions?: FormulaVersion[]
  meta: Record<string, number>
}

export interface AccordbookBackup {
  app: 'Accordbook'
  formatVersion: 2
  exportedAt: string
  data: AccordbookBackupData
}
