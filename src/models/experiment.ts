import type { FormulaVersionSnapshot, FormulaSnapshotRow } from './formula'

export interface ExperimentContent {
  rows: FormulaSnapshotRow[]
}

export type ExperimentBaseSource =
  | { kind: 'current'; sourceCurrentUpdatedAt: string }
  | { kind: 'version'; sourceVersionId: string }

export interface ExperimentVariant {
  variantId: string
  parentVariantId: string | null
  label: string
  createdAt: string
  updatedAt: string
  snapshot: ExperimentContent
  note: string
}

export interface Experiment {
  experimentId: string
  parentFormulaId: string
  name: string
  createdAt: string
  updatedAt: string
  baseSource: ExperimentBaseSource
  baseSnapshot: FormulaVersionSnapshot
  nextVariantOrdinal: number
  variants: ExperimentVariant[]
}
