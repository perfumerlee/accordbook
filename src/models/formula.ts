export interface FormulaDilution {
  enabled: boolean
  percent: number
  solvent: string
}

export interface FormulaMaterial {
  id: string
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

export type ProvenanceOriginType = 'original' | 'imported' | 'duplicated' | 'reference' | 'unknown'
export interface ClaimedSource { originType: ProvenanceOriginType; author?: string; sourceTitle?: string; sourceUrl?: string; reference?: string }
export type RevisionEventType = 'created' | 'imported' | 'duplicated' | 'modified' | 'source_updated' | 'archived' | 'restored' | 'exported' | 'provenance_initialized'
export interface FormulaRevision { revisionId: string; sequence: number; eventType: RevisionEventType; recordedAt: string; contentFingerprint: string; previousRevisionHash: string | null; revisionHash: string }
export interface FormulaProvenance { schemaVersion: 1; recordId: string; rootRecordId: string; parentRecordId: string | null; parentFingerprint: string | null; claimedSource: ClaimedSource; revisions: FormulaRevision[]; currentFingerprint: string; currentRevisionHash: string; checkpoint?: ProvenanceCheckpoint }
export interface FingerprintMetadata { algorithm: 'SHA-256'; canonicalizationVersion: 1; value: string }
export interface ProvenanceCheckpoint { kind: 'genesis' | 'migration'; recordedAt: string; formulaSnapshot: string; fingerprint: FingerprintMetadata }
