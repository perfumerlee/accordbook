import type { Formula, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import { appendRevision, contentFingerprint } from './provenance'
import { ensureRowIds, snapshotOf } from './reconstruction'
import type { AccordbookStorage } from '../storage/storageService'
import { isMeaningfulFormulaRow } from './formulaRowSemantics'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function createVersionSnapshot(formula: Formula): FormulaVersionSnapshot {
  const normalized = ensureRowIds(formula)
  return clone({ name: normalized.name, date: normalized.date, notes: normalized.notes, formulaId: normalized.formulaId, rows: snapshotOf(normalized).map(({ rowId, material, cas, parts, dilution }) => ({ rowId, material, cas, parts, dilution })) })
}

export function areVersionSnapshotsEqual(left: FormulaVersionSnapshot, right: FormulaVersionSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

// Restore safety has broader semantics than the legacy composition fingerprint:
// metadata that would be lost by restore must also be protected. Placeholder
// editor rows are intentionally excluded, while unnamed rows with meaningful
// parts/CAS/dilution remain part of the safety snapshot.
export function areRestoreSafetyStatesEqual(left: FormulaVersionSnapshot, right: FormulaVersionSnapshot): boolean {
  const normalize = (snapshot: FormulaVersionSnapshot) => JSON.stringify({
    name: snapshot.name.trim(),
    date: snapshot.date.trim(),
    notes: snapshot.notes.replace(/\r\n?/g, '\n'),
    formulaId: snapshot.formulaId.trim(),
    rows: snapshot.rows.filter(isMeaningfulFormulaRow).map(({ rowId, material, cas, parts, dilution }) => ({ rowId, material: material.trim(), cas: (cas ?? '').trim(), parts, dilution: dilution ? { enabled: dilution.enabled, percent: dilution.percent, solvent: dilution.solvent.trim().toUpperCase() } : undefined })).sort((a, b) => a.rowId.localeCompare(b.rowId)),
  })
  return normalize(left) === normalize(right)
}

async function nextNumber(storage: AccordbookStorage, parentFormulaId: string): Promise<number> {
  const versions = await storage.versions.listByParentFormulaId(parentFormulaId)
  return Math.max(0, ...versions.filter((v) => v.kind === 'manual' && typeof v.versionNumber === 'number').map((v) => v.versionNumber!)) + 1
}

export async function createFormulaVersion(storage: AccordbookStorage, formula: Formula, note = ''): Promise<FormulaVersion> {
  const normalized = ensureRowIds(formula)
  const version: FormulaVersion = { versionId: crypto.randomUUID(), parentFormulaId: normalized.id, versionNumber: await nextNumber(storage, normalized.id), kind: 'manual', createdAt: new Date().toISOString(), note, snapshot: createVersionSnapshot(normalized), sourceCurrentUpdatedAt: normalized.updatedAt, sourceFingerprint: await contentFingerprint(normalized), sourceRevisionId: normalized.provenance?.revisions[normalized.provenance.revisions.length - 1]?.revisionId }
  await storage.versions.save(version)
  return version
}

export async function listFormulaVersions(storage: AccordbookStorage, parentFormulaId: string): Promise<FormulaVersion[]> { return storage.versions.listByParentFormulaId(parentFormulaId) }

async function createRestorePoint(storage: AccordbookStorage, formula: Formula, target: FormulaVersion): Promise<FormulaVersion> {
  const targetLabel = target.kind === 'manual' && target.versionNumber !== null ? `v${target.versionNumber}` : 'a restore point'
  const point: FormulaVersion = { versionId: crypto.randomUUID(), parentFormulaId: formula.id, versionNumber: null, kind: 'restore-point', createdAt: new Date().toISOString(), note: `Before restoring ${targetLabel}`, snapshot: createVersionSnapshot(formula), sourceCurrentUpdatedAt: formula.updatedAt, sourceFingerprint: await contentFingerprint(formula), sourceRevisionId: formula.provenance?.revisions[formula.provenance.revisions.length - 1]?.revisionId }
  await storage.versions.save(point)
  return point
}

export async function restoreFormulaVersion(storage: AccordbookStorage, current: Formula, version: FormulaVersion): Promise<Formula> {
  if (version.parentFormulaId !== current.id) throw new Error('Version does not belong to this Formula.')
  const versions = await listFormulaVersions(storage, current.id)
  const latestManual = versions.filter((v) => v.kind === 'manual').sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0]
  const currentSnapshot = createVersionSnapshot(current)
  if (latestManual && !areRestoreSafetyStatesEqual(currentSnapshot, latestManual.snapshot)) await createRestorePoint(storage, current, version)
  const restored: Formula = { ...current, name: version.snapshot.name, date: version.snapshot.date, notes: version.snapshot.notes, rows: clone(version.snapshot.rows).map((row) => ({ ...row, id: crypto.randomUUID(), rowId: row.rowId, dilution: row.dilution ? { ...row.dilution } : undefined })), updatedAt: new Date().toISOString() }
  return appendRevision(restored, 'restored', restored.provenance?.claimedSource, { restoredFromVersionId: version.versionId })
}
