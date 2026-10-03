import type { AccordbookStorage } from '../storage/storageService'
import type { WorkspaceMetaUpdate } from '../storage/workspaceRepository'

/** Read-only proposal. Atomic append rechecks both the counter and display collision domain. */
export async function proposeWorkspaceDisplayId(storage: AccordbookStorage, date: Date, sourceDisplayId?: string): Promise<{ displayFormulaId: string; metaUpdate: WorkspaceMetaUpdate }> {
  const settings = await storage.settings.get()
  const prefix = settings?.formulaIdPrefix.trim().toUpperCase() || 'ACC'
  const month = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`
  const key = `${prefix}-${month}`
  const [sequence, active, archive] = await Promise.all([storage.meta.getSequence(key), storage.formulas.list(), storage.archive.list()])
  if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0)) throw new Error('Invalid local Formula sequence')
  const occupied = new Set([...active, ...archive].map(f => f.formulaId))
  if (sourceDisplayId) occupied.add(sourceDisplayId)
  let value = sequence ?? 0
  let displayFormulaId: string
  do {
    value++
    if (!Number.isSafeInteger(value)) throw new Error('Local Formula sequence exhausted')
    displayFormulaId = `${key}-${String(value).padStart(3, '0')}`
  } while (occupied.has(displayFormulaId))
  return { displayFormulaId, metaUpdate: { key, value, expectedValue: sequence ?? null } }
}
