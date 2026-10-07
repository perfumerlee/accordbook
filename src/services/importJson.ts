import type { ClaimedSource, Formula, FormulaMaterial, FormulaVersion, ProvenanceOriginType } from '../models/formula'
import type { AccordbookBackup, AccordbookBackupData } from '../models/backup'
import type { AccordbookStorage } from '../storage/storageService'
import { validateExperiment } from './experimentLifecycle'
import type { Experiment } from '../models/experiment'
import type { AiReviewRecord } from '../models/aiReviewRecord'
import { validateFormulaAiReviewRecord } from '../models/aiReviewRecord'
import { validateExperimentAiCompareReviewRecord } from '../models/experimentAiReviewRecord'
import { validateExperimentNextRoundReviewRecord } from '../models/experimentNextRoundAi'

export class BackupImportError extends Error {}
const originTypes: ProvenanceOriginType[] = ['not_specified', 'original', 'inspired_by', 'adapted_from', 'imported', 'duplicated', 'reference', 'unknown']
const normalizeClaimedSource = (value: unknown): ClaimedSource | undefined => { if (!value || typeof value !== 'object') return undefined; const source = value as Partial<ClaimedSource>; if (!originTypes.includes(source.originType as ProvenanceOriginType)) return undefined; const result: ClaimedSource = { originType: source.originType as ProvenanceOriginType }; if (source.relationship === 'original' || source.relationship === 'inspired_by' || source.relationship === 'adapted_from') result.relationship = source.relationship; for (const key of ['title', 'creator', 'url', 'note', 'author', 'sourceTitle', 'sourceUrl', 'reference'] as const) if (typeof source[key] === 'string') result[key] = source[key]; return result }
const normalizeRow = (row: Partial<FormulaMaterial>, index: number): FormulaMaterial => ({ ...(typeof (row as { memo?: unknown }).memo === 'string' ? { memo: (row as { memo: string }).memo } : {}), id: typeof row.id === 'string' ? row.id : `imported-row-${index}`, ...(typeof row.rowId === 'string' ? { rowId: row.rowId } : {}), parts: typeof row.parts === 'number' ? row.parts : '', material: typeof row.material === 'string' ? row.material : '', cas: typeof row.cas === 'string' ? row.cas : undefined, marked: row.marked === true, dilution: row.dilution && typeof row.dilution === 'object' ? { enabled: row.dilution.enabled === true, percent: typeof row.dilution.percent === 'number' ? row.dilution.percent : 10, solvent: typeof row.dilution.solvent === 'string' ? row.dilution.solvent : 'ALC' } : undefined })
const normalizeFormula = (value: Partial<Formula>, index: number): Formula => { if (typeof value.id !== 'string' || typeof value.formulaId !== 'string' || typeof value.date !== 'string') throw new BackupImportError('Invalid Formula data.'); if (value.releasedVersionId !== undefined && (typeof value.releasedVersionId !== 'string' || !value.releasedVersionId.trim())) throw new BackupImportError('Invalid released version id.'); const workspaceImport = value.workspaceImport && typeof value.workspaceImport === 'object' && typeof value.workspaceImport.sourceFormulaId === 'string' && typeof value.workspaceImport.importedAt === 'string' ? value.workspaceImport : undefined; return { ...(value.releasedVersionId ? { releasedVersionId: value.releasedVersionId } : {}), ...(workspaceImport ? { workspaceImport } : {}), id: value.id, formulaId: value.formulaId, date: value.date, name: typeof value.name === 'string' ? value.name : '', notes: typeof value.notes === 'string' ? value.notes : '', rows: Array.isArray(value.rows) ? value.rows.map(normalizeRow) : (() => { throw new BackupImportError('Invalid Formula rows.') })(), createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(), updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(), ...(typeof value.archivedAt === 'string' ? { archivedAt: value.archivedAt } : {}), ...(value.provenance && typeof value.provenance === 'object' ? { provenance: value.provenance } : {}) } }
const normalizeVersion = (value: Partial<FormulaVersion>, index: number): FormulaVersion => { if (typeof value.versionId !== 'string' || typeof value.parentFormulaId !== 'string' || (value.kind !== 'manual' && value.kind !== 'restore-point') || (value.versionNumber !== null && typeof value.versionNumber !== 'number') || typeof value.createdAt !== 'string' || !value.snapshot || typeof value.snapshot !== 'object') throw new BackupImportError(`Invalid Time Machine version at index ${index}.`); const snapshot = value.snapshot; if (typeof snapshot.name !== 'string' || typeof snapshot.date !== 'string' || typeof snapshot.notes !== 'string' || typeof snapshot.formulaId !== 'string' || !Array.isArray(snapshot.rows)) throw new BackupImportError(`Invalid Time Machine snapshot at index ${index}.`); const claimedSource = normalizeClaimedSource(snapshot.claimedSource); return { versionId: value.versionId, parentFormulaId: value.parentFormulaId, versionNumber: value.versionNumber, kind: value.kind, createdAt: value.createdAt, note: typeof value.note === 'string' ? value.note : '', snapshot: { name: snapshot.name, date: snapshot.date, notes: snapshot.notes, formulaId: snapshot.formulaId, rows: snapshot.rows.map((row, rowIndex) => ({ ...(typeof row.memo === 'string' ? { memo: row.memo } : {}), ...(typeof row.marked === 'boolean' ? { marked: row.marked } : {}), rowId: typeof row.rowId === 'string' ? row.rowId : `imported-snapshot-row-${index}-${rowIndex}`, material: typeof row.material === 'string' ? row.material : '', parts: typeof row.parts === 'number' ? row.parts : '', cas: typeof row.cas === 'string' ? row.cas : undefined, dilution: row.dilution && typeof row.dilution === 'object' ? { enabled: row.dilution.enabled === true, percent: typeof row.dilution.percent === 'number' ? row.dilution.percent : 10, solvent: typeof row.dilution.solvent === 'string' ? row.dilution.solvent : 'ALC' } : undefined })), ...(claimedSource ? { claimedSource } : {}) }, sourceCurrentUpdatedAt: typeof value.sourceCurrentUpdatedAt === 'string' ? value.sourceCurrentUpdatedAt : '', ...(typeof value.sourceFingerprint === 'string' ? { sourceFingerprint: value.sourceFingerprint } : {}), ...(typeof value.sourceRevisionId === 'string' ? { sourceRevisionId: value.sourceRevisionId } : {}) } }
export function parseBackup(input: string): AccordbookBackup {
  let raw: unknown
  try { raw = JSON.parse(input) } catch { throw new BackupImportError('Invalid JSON backup file.') }
  if (!raw || typeof raw !== 'object') throw new BackupImportError('Invalid Accordbook backup file.')
  const value = raw as { app?: unknown; formatVersion?: unknown; exportedAt?: unknown; data?: unknown }
  if (value.app !== 'Accordbook' || ![1, 2, 3, 4, 5].includes(value.formatVersion as number) || !value.data || typeof value.data !== 'object') throw new BackupImportError('Unsupported or invalid backup version.')
  const data = value.data as Partial<AccordbookBackupData>
  if (!Array.isArray(data.formulas) || !Array.isArray(data.archive) || !data.settings || typeof data.settings !== 'object' || !data.meta || typeof data.meta !== 'object') throw new BackupImportError('Invalid Accordbook backup structure.')
  const formulas = data.formulas.map((item, index) => normalizeFormula(item, index))
  const archive = data.archive.map((item, index) => normalizeFormula(item, index))
  const versions = Array.isArray(data.versions) ? data.versions.map((item, index) => normalizeVersion(item, index)) : []
  const formulaIds = [...formulas, ...archive].map(formula => formula.id)
  if (new Set(formulaIds).size !== formulaIds.length) throw new BackupImportError('Duplicate Formula id.')
  if (new Set(versions.map(version => version.versionId)).size !== versions.length) throw new BackupImportError('Duplicate Version id.')
  for (const version of versions) {
    if (!formulaIds.includes(version.parentFormulaId)) throw new BackupImportError('Orphan Time Machine version.')
    if (version.kind === 'manual' && (version.versionNumber === null || !Number.isInteger(version.versionNumber) || version.versionNumber < 1)) throw new BackupImportError('Invalid manual version number.')
    if (version.kind === 'restore-point' && version.versionNumber !== null) throw new BackupImportError('Invalid restore-point version number.')
  }
  const experiments = (value.formatVersion === 3 || value.formatVersion === 4 || value.formatVersion === 5)
    ? (Array.isArray(data.experiments) ? data.experiments as Experiment[] : (() => { throw new BackupImportError('Invalid Experiment backup structure.') })())
    : []
  if (new Set(experiments.map(item => item.experimentId)).size !== experiments.length) throw new BackupImportError('Duplicate Experiment id.')
  for (const experiment of experiments) {
    if (!formulaIds.includes(experiment.parentFormulaId)) throw new BackupImportError('Orphan Experiment.')
    try { validateExperiment(experiment) } catch { throw new BackupImportError('Invalid Experiment data.') }
  }
  let reviews: AiReviewRecord[] | undefined
  if (value.formatVersion === 4 || value.formatVersion === 5) {
    if (!Array.isArray(data.reviews)) throw new BackupImportError('Invalid AI Review backup structure.')
    reviews = data.reviews as AiReviewRecord[]
    if (new Set(reviews.map(item => item?.reviewId)).size !== reviews.length) throw new BackupImportError('Duplicate AI Review id.')
    for (const review of reviews) {
      try {
        if (value.formatVersion === 4) {
          if (review?.reviewType !== 'formula') throw new Error('Unexpected v4 review type')
          validateFormulaAiReviewRecord(review)
        } else if (review?.reviewType === 'formula') validateFormulaAiReviewRecord(review)
        else if (review?.reviewType === 'experiment' && review?.operation === 'compare') validateExperimentAiCompareReviewRecord(review)
        else if (review?.reviewType === 'experiment' && review?.operation === 'next_round') validateExperimentNextRoundReviewRecord(review)
        else throw new Error('Unknown review type')
      } catch { throw new BackupImportError('Invalid AI Review data.') }
      // Source formulas may have been deleted before backup; preserve those reviews as orphans.
    }
  }
  for (const formula of [...formulas, ...archive]) {
    if (formula.releasedVersionId && !versions.some(version => version.versionId === formula.releasedVersionId && version.parentFormulaId === formula.id && version.kind === 'manual')) throw new BackupImportError('Invalid released version reference.')
  }
  const manualKeys = versions.filter(version => version.kind === 'manual').map(version => `${version.parentFormulaId}:${version.versionNumber}`)
  if (new Set(manualKeys).size !== manualKeys.length) throw new BackupImportError('Duplicate manual version number.')
  return {
    app: 'Accordbook', formatVersion: value.formatVersion as 1 | 2 | 3 | 4 | 5,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    data: {
      settings: { formulaIdPrefix: typeof data.settings.formulaIdPrefix === 'string' ? data.settings.formulaIdPrefix : 'ACC', language: data.settings.language === 'ko' ? 'ko' : 'en' },
      formulas, archive, versions, experiments,
      ...(reviews === undefined ? {} : { reviews }),
      meta: Object.fromEntries(Object.entries(data.meta).filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
    },
  }
}
export async function importBackup(storage: AccordbookStorage, backup: AccordbookBackup): Promise<void> {
  if (backup.formatVersion === 4) {
    // Preserve Experiment reviews atomically with the local backup replacement transaction.
    await storage.importData(backup.data, { preserveExperimentReviews: true })
    return
  }
  await storage.importData(backup.data)
}
