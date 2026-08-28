import type { Formula } from '../models/formula'
import { generateFormulaId } from './formulaIdGenerator'
import type { AccordbookStorage } from '../storage/storageService'

const emptyRow = () => ({ id: crypto.randomUUID(), parts: '' as const, material: '' })
const timestamp = () => new Date().toISOString()

export async function createFormula(storage: AccordbookStorage, prefix = 'ACC'): Promise<Formula> {
  const date = new Date(); const stamp = timestamp()
  return { id: crypto.randomUUID(), formulaId: await generateFormulaId({ prefix, date }, storage.meta), date: stamp.slice(0, 10), name: '', notes: '', rows: [emptyRow()], createdAt: stamp, updatedAt: stamp }
}
export async function duplicateFormula(storage: AccordbookStorage, source: Formula, prefix = 'ACC'): Promise<Formula> {
  const date = new Date(); const stamp = timestamp()
  const copy: Formula = { ...source, id: crypto.randomUUID(), formulaId: await generateFormulaId({ prefix, date }, storage.meta), date: stamp.slice(0, 10), createdAt: stamp, updatedAt: stamp, archivedAt: undefined, rows: source.rows.map((row) => ({ ...row, id: crypto.randomUUID(), dilution: row.dilution ? { ...row.dilution } : undefined })) }
  await storage.formulas.save(copy); return copy
}
export function resetMaterials(formula: Formula): Formula { return { ...formula, rows: [emptyRow()], updatedAt: timestamp() } }
export function archiveFormula(storage: AccordbookStorage, formula: Formula): Promise<void> { return storage.formulas.moveToArchive(formula) }
export function restoreFormula(storage: AccordbookStorage, formula: Formula): Promise<void> { return storage.archive.restore(formula) }
export function deleteArchivedFormula(storage: AccordbookStorage, id: string): Promise<void> { return storage.archive.deletePermanently(id) }
