import type { Formula, FormulaVersion } from './formula'
import type { AccordbookSettings } from './settings'
import type { Experiment } from './experiment'
import type { AiReviewRecord } from './aiReviewRecord'

export interface AccordbookBackupData {
  settings: AccordbookSettings
  formulas: Formula[]
  archive: Formula[]
  versions?: FormulaVersion[]
  experiments?: Experiment[]
  /** Absent only when parsing a legacy v1-v3 backup. */
  reviews?: AiReviewRecord[]
  meta: Record<string, number>
}

export interface AccordbookBackup {
  app: 'Accordbook'
  formatVersion: 1 | 2 | 3 | 4 | 5
  exportedAt: string
  data: AccordbookBackupData
}
