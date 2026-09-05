import type { Formula } from '../models/formula'
import { generateFormulaId } from './formulaIdGenerator'
import type { AccordbookStorage } from '../storage/storageService'
import { createProvenance } from './provenance'

const emptyRow = () => ({ id: crypto.randomUUID(), rowId: crypto.randomUUID(), parts: '' as const, material: '' })
const timestamp = () => new Date().toISOString()
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export async function createFormula(storage: AccordbookStorage, prefix = 'ACC'): Promise<Formula> {
  const date = new Date(); const stamp = timestamp()
  const formula: Formula = { id: crypto.randomUUID(), formulaId: await generateFormulaId({ prefix, date }, storage.meta), date: localDate(date), name: '', notes: '', rows: [emptyRow()], createdAt: stamp, updatedAt: stamp }
  return { ...formula, provenance: await createProvenance(formula, 'created', { originType: 'not_specified' }) }
}
export async function duplicateFormula(storage: AccordbookStorage, source: Formula, prefix = 'ACC'): Promise<Formula> {
  const date = new Date(); const stamp = timestamp()
  const copy: Formula = { ...source, id: crypto.randomUUID(), formulaId: await generateFormulaId({ prefix, date }, storage.meta), date: localDate(date), createdAt: stamp, updatedAt: stamp, archivedAt: undefined, rows: source.rows.map((row) => ({ ...row, id: crypto.randomUUID(), rowId: crypto.randomUUID(), dilution: row.dilution ? { ...row.dilution } : undefined })) }
  copy.provenance = await createProvenance(copy, 'duplicated', { originType: 'adapted_from', title: source.formulaId }, source.provenance ? { rootRecordId: source.provenance.rootRecordId, parentRecordId: source.provenance.recordId, parentFingerprint: source.provenance.currentFingerprint } : undefined)
  await storage.formulas.save(copy); return copy
}
export async function createFormulaFromVersion(storage: AccordbookStorage, version: import('../models/formula').FormulaVersion, prefix = 'ACC'): Promise<Formula> {
  const base = await createFormula(storage, prefix)
  const snapshot = version.snapshot
  const suffix = version.kind === 'manual' && version.versionNumber !== null ? ` — V${version.versionNumber}` : ''
  const created: Formula = { ...base, name: snapshot.name ? snapshot.name + suffix : base.name, notes: snapshot.notes, rows: snapshot.rows.map((row) => ({ id: crypto.randomUUID(), rowId: crypto.randomUUID(), material: row.material, cas: row.cas, parts: row.parts, dilution: row.dilution ? { ...row.dilution } : undefined })) }
  const sourceFormula = await storage.formulas.get(version.parentFormulaId)
  const sourceId = sourceFormula?.formulaId ?? version.snapshot.formulaId
  const sourceName = snapshot.name || sourceFormula?.name || sourceId
  const versionLabel = version.versionNumber === null ? '' : ` · V${version.versionNumber}`
  created.provenance = await createProvenance(created, 'created', { originType: 'adapted_from', title: `${sourceName} · ${sourceId}${versionLabel}` })
  await storage.formulas.save(created)
  return created
}
export function resetMaterials(formula: Formula): Formula { return { ...formula, rows: [emptyRow()], updatedAt: timestamp() } }
export function archiveFormula(storage: AccordbookStorage, formula: Formula): Promise<void> { return storage.formulas.moveToArchive(formula) }
export function restoreFormula(storage: AccordbookStorage, formula: Formula): Promise<void> { return storage.archive.restore(formula) }
export async function deleteArchivedFormula(storage: AccordbookStorage, id: string): Promise<void> { await storage.archive.deletePermanently(id); await storage.versions.deleteByParentFormulaId(id) }
