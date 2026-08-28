import type { Formula } from './formula'
import type { AccordbookSettings } from './settings'

export interface AccordbookBackupData {
  settings: AccordbookSettings
  formulas: Formula[]
  archive: Formula[]
  meta: Record<string, number>
}

export interface AccordbookBackup {
  app: 'Accordbook'
  formatVersion: 1
  exportedAt: string
  data: AccordbookBackupData
}
