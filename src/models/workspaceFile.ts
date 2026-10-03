// External transport DTOs. Do not alias persisted models: this contract evolves independently.
export interface WorkspaceDilution { enabled: boolean; percent: number; solvent: string }
export interface WorkspaceRow {
  rowId?: string
  material: string
  parts: number | ''
  cas?: string
  marked?: boolean
  memo?: string
  dilution?: WorkspaceDilution
}
export interface WorkspaceSnapshotRow extends WorkspaceRow { rowId: string }
export interface WorkspaceClaimedSource {
  originType: 'not_specified' | 'original' | 'inspired_by' | 'adapted_from' | 'imported' | 'duplicated' | 'reference' | 'unknown'
  relationship?: 'original' | 'inspired_by' | 'adapted_from'
  title?: string; creator?: string; url?: string; note?: string
  author?: string; sourceTitle?: string; sourceUrl?: string; reference?: string
}
export interface WorkspaceRevision {
  revisionId: string; sequence: number
  eventType: 'created' | 'imported' | 'duplicated' | 'modified' | 'source_updated' | 'archived' | 'restored' | 'exported' | 'provenance_initialized'
  recordedAt: string; contentFingerprint: string; previousRevisionHash: string | null
  revisionHash: string; revisionHashPayloadVersion?: 1; restoredFromVersionId?: string
}
export interface WorkspaceProvenance {
  schemaVersion: 1
  recordId: string; rootRecordId: string; parentRecordId: string | null; parentFingerprint: string | null
  claimedSource: WorkspaceClaimedSource
  revisions: WorkspaceRevision[]
  currentFingerprint: string; currentRevisionHash: string; revisionHashPayloadVersion?: 1
  checkpoint?: {
    kind: 'genesis' | 'migration'; recordedAt: string; formulaSnapshot: string
    fingerprint: { algorithm: 'SHA-256'; canonicalizationVersion: 1; value: string }
  }
}
export interface WorkspaceFormula {
  id: string; formulaId: string; date: string; name: string; notes: string
  rows: WorkspaceRow[]; createdAt: string; updatedAt: string
  releasedVersionId?: string; provenance?: WorkspaceProvenance
}
export interface WorkspaceSnapshot {
  name: string; date: string; notes: string; formulaId: string
  rows: WorkspaceSnapshotRow[]; claimedSource?: WorkspaceClaimedSource
}
export interface WorkspaceVersion {
  versionId: string; parentFormulaId: string; versionNumber: number | null
  kind: 'manual' | 'restore-point'; createdAt: string; note: string
  snapshot: WorkspaceSnapshot; sourceCurrentUpdatedAt: string
  sourceFingerprint?: string; sourceRevisionId?: string
}
export type WorkspaceVerdict = 'continue' | 'hold' | 'stop' | 'uncertain'
export type WorkspaceBranchPurpose = 'development' | 'check' | 'comparison'
export interface WorkspaceContent { rows: WorkspaceSnapshotRow[] }
export interface WorkspaceEvaluation {
  evaluationId: string; createdAt: string; updatedAt: string; snapshot: WorkspaceContent
  observation: string; verdict: WorkspaceVerdict; nextAction: string; decisionNote?: string
}
export interface WorkspaceVariant {
  variantId: string; parentVariantId: string | null; label: string
  createdAt: string; updatedAt: string; nextChildOrdinal?: number
  snapshot: WorkspaceContent; note: string; evaluations?: WorkspaceEvaluation[]
  sourceEvaluationId?: string; evaluationBranchPurpose?: WorkspaceBranchPurpose
  origin?: {
    evaluationId: string; observation: string; verdict: WorkspaceVerdict
    nextAction: string; decisionNote?: string; branchPurpose: WorkspaceBranchPurpose
  }
  intent?: { branchPurpose: WorkspaceBranchPurpose; changeIntent: string; hypothesis: string }
}
export interface WorkspaceExperiment {
  experimentId: string; parentFormulaId: string; name: string; createdAt: string; updatedAt: string
  baseSource: { kind: 'current'; sourceCurrentUpdatedAt: string } | { kind: 'version'; sourceVersionId: string }
  baseSnapshot: WorkspaceSnapshot; nextVariantOrdinal: number; variants: WorkspaceVariant[]
}
export interface WorkspaceFile {
  type: 'accordbook-workspace'
  formatVersion: 1
  exportedAt: string
  formula: WorkspaceFormula
  versions: WorkspaceVersion[]
  experiments: WorkspaceExperiment[]
}
