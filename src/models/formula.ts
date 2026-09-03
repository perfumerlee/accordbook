export interface FormulaDilution {
  enabled: boolean
  percent: number
  solvent: string
}

export interface FormulaMaterial {
  id: string
  rowId?: string
  parts: number | ''
  material: string
  cas?: string
  marked?: boolean
  dilution?: FormulaDilution
}

export interface Formula {
  id: string
  formulaId: string
  date: string
  name: string
  notes: string
  rows: FormulaMaterial[]
  createdAt: string
  updatedAt: string
  archivedAt?: string
  provenance?: FormulaProvenance
}

export type ProvenanceOriginType = 'not_specified' | 'original' | 'inspired_by' | 'adapted_from' | 'imported' | 'duplicated' | 'reference' | 'unknown'
export interface ClaimedSource { originType: ProvenanceOriginType; relationship?: 'original' | 'inspired_by' | 'adapted_from'; title?: string; creator?: string; url?: string; note?: string; author?: string; sourceTitle?: string; sourceUrl?: string; reference?: string }
export type RevisionEventType = 'created' | 'imported' | 'duplicated' | 'modified' | 'source_updated' | 'archived' | 'restored' | 'exported' | 'provenance_initialized'
export interface FormulaRevision { revisionId: string; sequence: number; eventType: RevisionEventType; recordedAt: string; contentFingerprint: string; previousRevisionHash: string | null; revisionHash: string; revisionHashPayloadVersion?: 1; restoredFromVersionId?: string }
export interface FormulaProvenance { schemaVersion: 1; recordId: string; rootRecordId: string; parentRecordId: string | null; parentFingerprint: string | null; claimedSource: ClaimedSource; revisions: FormulaRevision[]; currentFingerprint: string; currentRevisionHash: string; revisionHashPayloadVersion?: 1; checkpoint?: ProvenanceCheckpoint }
export interface FormulaSnapshotRow { rowId: string; material: string; cas?: string; parts: number | ''; dilution?: FormulaDilution }
export interface ReconstructionDelta { type: 'row_added' | 'row_removed' | 'row_updated'; rowId: string; index?: number; before?: FormulaSnapshotRow; after?: FormulaSnapshotRow }
export interface ReconstructionCheckpoint { revisionId: string; sequence: number; recordedAt: string; fingerprint: string; snapshot: FormulaSnapshotRow[] }
export interface FingerprintMetadata { algorithm: 'SHA-256'; canonicalizationVersion: 1; value: string }
export interface ProvenanceCheckpoint { kind: 'genesis' | 'migration'; recordedAt: string; formulaSnapshot: string; fingerprint: FingerprintMetadata }

export interface FormulaVersionSnapshot { name: string; date: string; notes: string; formulaId: string; rows: FormulaSnapshotRow[] }
export interface FormulaVersion { versionId: string; parentFormulaId: string; versionNumber: number | null; kind: 'manual' | 'restore-point'; createdAt: string; note: string; snapshot: FormulaVersionSnapshot; sourceCurrentUpdatedAt: string; sourceFingerprint?: string; sourceRevisionId?: string }
