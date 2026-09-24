import type { FormulaVersionSnapshot, FormulaSnapshotRow } from './formula'

export interface ExperimentContent {
  rows: FormulaSnapshotRow[]
}

export type EvaluationVerdict = 'continue' | 'hold' | 'stop' | 'uncertain'
export type EvaluationBranchPurpose = 'development' | 'check' | 'comparison'

export interface VariantOrigin {
  evaluationId: string
  observation: string
  verdict: EvaluationVerdict
  nextAction: string
  decisionNote?: string
  branchPurpose: EvaluationBranchPurpose
}

export interface VariantExperimentIntent {
  branchPurpose: EvaluationBranchPurpose
  changeIntent: string
  hypothesis: string
}

export interface VariantEvaluation {
  evaluationId: string
  createdAt: string
  updatedAt: string
  snapshot: ExperimentContent
  observation: string
  verdict: EvaluationVerdict
  nextAction: string
  decisionNote?: string
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
  nextChildOrdinal?: number
  snapshot: ExperimentContent
  note: string
  evaluations?: VariantEvaluation[]
  sourceEvaluationId?: string
  evaluationBranchPurpose?: EvaluationBranchPurpose
  origin?: VariantOrigin
  intent?: VariantExperimentIntent
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
