import type { WorkspaceFile, WorkspaceProvenance } from '../models/workspaceFile'
import { profileWorkspace } from './workspaceProfile'

// Transport abuse limits, not editor/product limits. Totals include all embedded snapshots.
export const WORKSPACE_LIMITS = Object.freeze({
  maxFileBytes: 64 * 1024 * 1024, maxVersions: 10_000, maxExperiments: 10_000,
  maxVariants: 50_000, maxEvaluations: 100_000, maxSnapshotRows: 10_000,
  maxTotalRows: 500_000, maxStringLength: 1_000_000, maxRevisions: 100_000,
  maxGenealogyDepth: 256,
})
export class WorkspaceValidationError extends Error {
  constructor(readonly path: string, readonly reason: string) { super(`${path}: ${reason}`); this.name = 'WorkspaceValidationError' }
}
const fail = (path: string, reason: string): never => { throw new WorkspaceValidationError(path, reason) }
/** TextEncoder-compatible UTF-8 length without allocating a buffer for every tiny field. */
export function workspaceUtf8Bytes(value: string): number {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) bytes++
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++ }
    else bytes += 3
  }
  return bytes
}
type Context = { strict: boolean; rows: number; variants: number; evaluations: number; stringBytes: number }
type Reader = (value: unknown, path: string, context: Context) => unknown
const str: Reader = (v, p, c) => {
  if (typeof v !== 'string' || v.length > WORKSPACE_LIMITS.maxStringLength) return fail(p, 'invalid or excessive string')
  c.stringBytes += workspaceUtf8Bytes(v)
  if (c.stringBytes > WORKSPACE_LIMITS.maxFileBytes) fail(p, 'aggregate string byte limit exceeded')
  return v
}
const id: Reader = (v, p, c) => { const s = str(v, p, c) as string; return s.trim() ? s : fail(p, 'empty identity') }
const date: Reader = (v, p, c) => {
  const s = str(v, p, c) as string
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) return fail(p, 'invalid ISO timestamp')
  day(s.slice(0, 10), p, c)
  return s
}
const day: Reader = (v, p, c) => { const s = str(v, p, c) as string; return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s ? s : fail(p, 'invalid calendar date') }
const integer = (min: number): Reader => (v, p) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : fail(p, 'invalid integer')
const enumeration = (...values: readonly (string | number)[]): Reader => (v, p) => values.includes(v as string | number) ? v : fail(p, 'unsupported value')
const optional = (read: Reader): Reader => (v, p, c) => v === undefined ? undefined : read(v, p, c)
const nullable = (read: Reader): Reader => (v, p, c) => v === null ? null : read(v, p, c)
const object = (fields: Record<string, Reader>): Reader => {
 const entries = Object.entries(fields)
 return (v, p, c) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected object')
  const input = v as Record<string, unknown>
  if (c.strict) for (const key of Object.keys(input)) if (!Object.prototype.hasOwnProperty.call(fields, key)) fail(`${p}.${key}`, 'unknown field')
  const result: Record<string, unknown> = {}
  for (const [key, read] of entries) {
    const value = read(Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined, `${p}.${key}`, c)
    if (value !== undefined) result[key] = value
  }
  return result
 }
}
const array = (read: Reader, max: number, counter?: 'rows' | 'variants' | 'evaluations'): Reader => (v, p, c) => {
  if (!Array.isArray(v) || v.length > max) return fail(p, 'invalid array or resource limit exceeded')
  if (counter) {
    c[counter] += v.length
    const limit = counter === 'rows' ? WORKSPACE_LIMITS.maxTotalRows : counter === 'variants' ? WORKSPACE_LIMITS.maxVariants : WORKSPACE_LIMITS.maxEvaluations
    if (c[counter] > limit) fail(p, `total ${counter} limit exceeded`)
  }
  return v.map((item, index) => read(item, `${p}[${index}]`, c))
}
const dilution = object({ enabled: (v, p) => typeof v === 'boolean' ? v : fail(p, 'expected boolean'), percent: (v, p) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : fail(p, 'percent must be 0..100'), solvent: str })
const rowFields = {
  material: str, parts: ((v, p) => v === '' || typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fail(p, 'invalid parts')) as Reader,
  cas: optional(str), marked: optional((v, p) => typeof v === 'boolean' ? v : fail(p, 'expected boolean')),
  memo: optional(str), dilution: optional(dilution),
}
const rows = (requiredId: boolean): Reader => {
  const read = array(object({ rowId: requiredId ? id : optional(id), ...rowFields }), WORKSPACE_LIMITS.maxSnapshotRows, 'rows')
  return (v, p, c) => { const result = read(v, p, c) as { rowId?: string }[]; unique(result.filter(r => r.rowId !== undefined).map(r => r.rowId!), p); return result }
}
const claimedSource = object({
  originType: enumeration('not_specified', 'original', 'inspired_by', 'adapted_from', 'imported', 'duplicated', 'reference', 'unknown'),
  relationship: optional(enumeration('original', 'inspired_by', 'adapted_from')),
  title: optional(str), creator: optional(str), url: optional(str), note: optional(str), author: optional(str),
  sourceTitle: optional(str), sourceUrl: optional(str), reference: optional(str),
})
const hash: Reader = (v, p) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) ? v : fail(p, 'invalid SHA-256 digest')
const revision = object({
  revisionId: id, sequence: integer(1), eventType: enumeration('created', 'imported', 'duplicated', 'modified', 'source_updated', 'archived', 'restored', 'exported', 'provenance_initialized'),
  recordedAt: date, contentFingerprint: hash, previousRevisionHash: nullable(hash), revisionHash: hash,
  revisionHashPayloadVersion: optional(enumeration(1)), restoredFromVersionId: optional(id),
})
const provenance = object({
  schemaVersion: enumeration(1), recordId: id, rootRecordId: id, parentRecordId: nullable(id), parentFingerprint: nullable(hash),
  claimedSource, revisions: array(revision, WORKSPACE_LIMITS.maxRevisions), currentFingerprint: hash, currentRevisionHash: hash,
  revisionHashPayloadVersion: optional(enumeration(1)),
  checkpoint: optional(object({ kind: enumeration('genesis', 'migration'), recordedAt: date, formulaSnapshot: str,
    fingerprint: object({ algorithm: enumeration('SHA-256'), canonicalizationVersion: enumeration(1), value: hash }) })),
})
/** Only provenance is newly generated after import; validate that changed subgraph's limits too. */
export function assertWorkspaceProvenanceShape(value: WorkspaceProvenance): void {
  provenance(value, '$.formula.provenance', { strict: true, rows: 0, variants: 0, evaluations: 0, stringBytes: 0 })
}
const snapshot = object({ name: str, date: day, notes: str, formulaId: id, rows: rows(true), claimedSource: optional(claimedSource) })
const content = object({ rows: rows(true) })
const verdict = enumeration('continue', 'hold', 'stop', 'uncertain')
const purpose = enumeration('development', 'check', 'comparison')
const evaluation = object({ evaluationId: id, createdAt: date, updatedAt: date, snapshot: content, observation: id, verdict, nextAction: str, decisionNote: optional(str) })
const variant = object({
  variantId: id, parentVariantId: nullable(id), label: id, createdAt: date, updatedAt: date,
  nextChildOrdinal: optional(integer(1)), snapshot: content, note: str,
  evaluations: optional(array(evaluation, WORKSPACE_LIMITS.maxEvaluations, 'evaluations')),
  sourceEvaluationId: optional(id), evaluationBranchPurpose: optional(purpose),
  origin: optional(object({ evaluationId: id, observation: id, verdict: enumeration('continue', 'hold', 'uncertain'), nextAction: str, decisionNote: optional(str), branchPurpose: purpose })),
  intent: optional(object({ branchPurpose: purpose, changeIntent: id, hypothesis: id })),
})
const baseSource: Reader = (v, p, c) => {
  const kind = v && typeof v === 'object' ? (v as { kind?: unknown }).kind : undefined
  if (kind === 'current') return object({ kind: enumeration('current'), sourceCurrentUpdatedAt: date })(v, p, c)
  if (kind === 'version') return object({ kind: enumeration('version'), sourceVersionId: id })(v, p, c)
  return fail(p, 'invalid BASE source')
}
const envelope = object({
  type: enumeration('accordbook-workspace'), formatVersion: enumeration(1), exportedAt: date,
  formula: object({ id, formulaId: id, date: day, name: str, notes: str, rows: rows(false), createdAt: date, updatedAt: date,
    releasedVersionId: optional(id), provenance: optional(provenance) }),
  versions: array(object({ versionId: id, parentFormulaId: id, versionNumber: nullable(integer(1)), kind: enumeration('manual', 'restore-point'),
    createdAt: date, note: str, snapshot, sourceCurrentUpdatedAt: date, sourceFingerprint: optional(hash), sourceRevisionId: optional(id) }), WORKSPACE_LIMITS.maxVersions),
  experiments: array(object({ experimentId: id, parentFormulaId: id, name: str, createdAt: date, updatedAt: date,
    baseSource, baseSnapshot: snapshot, nextVariantOrdinal: integer(0), variants: array(variant, WORKSPACE_LIMITS.maxVariants, 'variants') }), WORKSPACE_LIMITS.maxExperiments),
})
function unique(ids: readonly (string | number)[], path: string) { if (new Set(ids).size !== ids.length) fail(path, 'duplicate identity') }

export function validateWorkspaceGraph(file: WorkspaceFile): void {
  const { formula, versions, experiments } = file
  unique(versions.map(v => v.versionId), '$.versions')
  unique(experiments.map(e => e.experimentId), '$.experiments')
  unique(versions.filter(v => v.kind === 'manual').map(v => v.versionNumber!), '$.versions.versionNumber')
  const versionMap = new Map(versions.map(v => [v.versionId, v]))
  for (const v of versions) {
    if (v.parentFormulaId !== formula.id) fail('$.versions', 'wrong Formula owner')
    if ((v.kind === 'manual') !== (v.versionNumber !== null)) fail('$.versions', 'invalid version number for kind')
  }
  if (formula.releasedVersionId && versionMap.get(formula.releasedVersionId)?.kind !== 'manual') fail('$.formula.releasedVersionId', 'missing manual Version')
  const p = formula.provenance
  if (p) {
    unique(p.revisions.map(r => r.revisionId), '$.formula.provenance.revisions')
    if (!p.revisions.length) fail('$.formula.provenance', 'empty revision chain')
    p.revisions.forEach((r, i) => {
      if (r.sequence !== i + 1 || r.previousRevisionHash !== (i ? p.revisions[i - 1].revisionHash : null)) fail('$.formula.provenance.revisions', 'broken chain structure')
      if (r.restoredFromVersionId && !versionMap.has(r.restoredFromVersionId)) fail('$.formula.provenance.revisions', 'missing restored Version')
    })
    if (p.currentRevisionHash !== p.revisions[p.revisions.length - 1].revisionHash) fail('$.formula.provenance', 'chain head mismatch')
  }
  const revisionIds = new Set(p?.revisions.map(r => r.revisionId))
  for (const v of versions) if (v.sourceRevisionId && !revisionIds.has(v.sourceRevisionId)) fail('$.versions.sourceRevisionId', 'missing source revision')
  for (const e of experiments) {
    const path = `$.experiments[${e.experimentId}]`
    if (e.parentFormulaId !== formula.id) fail(path, 'wrong Formula owner')
    if (e.baseSource.kind === 'version' && !versionMap.has(e.baseSource.sourceVersionId)) fail(path, 'missing BASE Version')
    unique(e.variants.map(v => v.variantId), path)
    const variants = new Map(e.variants.map(v => [v.variantId, v]))
    for (const v of e.variants) {
      unique((v.evaluations ?? []).map(x => x.evaluationId), `${path}.${v.variantId}.evaluations`)
      const seen = new Set<string>(); let cursor: typeof v | undefined = v
      while (cursor) {
        if (seen.has(cursor.variantId)) fail(path, 'genealogy cycle')
        seen.add(cursor.variantId)
        if (seen.size > WORKSPACE_LIMITS.maxGenealogyDepth) fail(path, 'genealogy depth exceeded')
        if (cursor.parentVariantId === null) break
        cursor = variants.get(cursor.parentVariantId)
        if (!cursor) fail(path, 'missing parent Variant')
      }
      if (v.sourceEvaluationId && !variants.get(v.parentVariantId ?? '')?.evaluations?.some(x => x.evaluationId === v.sourceEvaluationId)) fail(path, 'missing parent Evaluation')
      if (v.evaluationBranchPurpose && !v.sourceEvaluationId) fail(path, 'Branch purpose without Evaluation')
      if (v.origin && (!v.sourceEvaluationId || v.origin.evaluationId !== v.sourceEvaluationId || v.origin.branchPurpose !== v.evaluationBranchPurpose)) fail(path, 'invalid historical Branch origin reference')
      if (v.intent && v.evaluationBranchPurpose && v.intent.branchPurpose !== v.evaluationBranchPurpose) fail(path, 'intent purpose mismatch')
    }
  }
}

/** Strict untrusted-file boundary; returns a fresh allowlisted DTO, never input aliases. */
export function validateWorkspaceFile(value: unknown): WorkspaceFile { return readWorkspaceDto(value, true) }
/** Domain export projection: unknown persisted fields are deliberately excluded at every level. */
export function projectWorkspaceFile(value: unknown): WorkspaceFile { return readWorkspaceDto(value, false) }
function readWorkspaceDto(value: unknown, strict: boolean): WorkspaceFile {
  const file = profileWorkspace('shape-projection', () => envelope(value, '$', { strict, rows: 0, variants: 0, evaluations: 0, stringBytes: 0 })) as WorkspaceFile
  profileWorkspace('graph-validation', () => validateWorkspaceGraph(file))
  if (new TextEncoder().encode(JSON.stringify(file)).byteLength > WORKSPACE_LIMITS.maxFileBytes) fail('$', 'file byte limit exceeded')
  return file
}

/** Optional async cryptographic boundary for the future importer. Graph checks always run first. */
export async function validateWorkspaceIntegrity(file: WorkspaceFile, verify: (provenance: WorkspaceProvenance) => Promise<boolean>): Promise<void> {
  const checked = validateWorkspaceFile(file)
  if (checked.formula.provenance && !await verify(checked.formula.provenance)) fail('$.formula.provenance', 'integrity verification failed')
}
