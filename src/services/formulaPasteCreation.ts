import type { Formula } from '../models/formula'
import type { AccordbookStorage } from '../storage/storageService'
import { WorkspaceAppendConflict } from '../storage/workspaceRepository'
import { proposeWorkspaceDisplayId } from './workspaceDisplayId'
import { createProvenance } from './provenance'
import { validateFormulaPasteEdits, type FormulaPasteEdits, type FormulaPasteMapping, type FormulaPasteParseResult } from './formulaPasteImport'
import { recognizeFormulaPasteDilution, validateFormulaPasteDilutionChoice, type FormulaPasteDilutionReviewChoice } from './formulaPasteDilution'

export const FORMULA_PASTE_CREATE_ATTEMPTS = 4

export class FormulaPasteCreationError extends Error {
  constructor(readonly code: 'invalid-review' | 'invalid-name' | 'identity-allocation' | 'concurrent-allocation' | 'save-failed') {
    super(code)
    this.name = 'FormulaPasteCreationError'
  }
}

export interface FormulaPasteCreationInput {
  name: string
  parsed: FormulaPasteParseResult
  mapping: FormulaPasteMapping
  edits: FormulaPasteEdits
  dilutionReviews?: Readonly<Record<number, FormulaPasteDilutionReviewChoice>>
  now?: Date
}

/** Creates one new imported Formula after rechecking the user-approved edits at the persistence boundary. */
export async function createFormulaFromPaste(storage: AccordbookStorage, input: FormulaPasteCreationInput): Promise<Formula> {
  if (!input.name.trim()) throw new FormulaPasteCreationError('invalid-name')
  const checked = validateFormulaPasteEdits(input.parsed, input.mapping, input.edits)
  if (!checked.readyForApproval || checked.rows.length === 0 || checked.rows.some(row => row.parts === undefined || !row.material)) {
    throw new FormulaPasteCreationError('invalid-review')
  }
  const sourceRows = new Set(checked.rows.map(row => row.sourceRowNumber))
  if (Object.keys(input.dilutionReviews ?? {}).some(key => !/^\d+$/.test(key) || !sourceRows.has(Number(key)))) {
    throw new FormulaPasteCreationError('invalid-review')
  }
  const rows = checked.rows.map(row => {
    const choice = input.dilutionReviews?.[row.sourceRowNumber]
    const validation = validateFormulaPasteDilutionChoice(recognizeFormulaPasteDilution(row.material), choice)
    if (choice?.mode === 'apply' && validation.status !== 'approved') throw new FormulaPasteCreationError('invalid-review')
    const approved = validation.status === 'approved' ? validation : undefined
    return {
      id: crypto.randomUUID(), rowId: crypto.randomUUID(),
      material: approved?.material ?? row.material, parts: row.parts!,
      ...(approved ? { dilution: approved.dilution } : {}),
    }
  })
  const date = input.now ? new Date(input.now) : new Date()
  if (!Number.isFinite(date.getTime())) throw new FormulaPasteCreationError('identity-allocation')
  const stamp = date.toISOString()
  const formulaDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  for (let attempt = 0; attempt < FORMULA_PASTE_CREATE_ATTEMPTS; attempt++) {
    let proposal: Awaited<ReturnType<typeof proposeWorkspaceDisplayId>>
    try { proposal = await proposeWorkspaceDisplayId(storage, date) }
    catch { throw new FormulaPasteCreationError('identity-allocation') }
    const formula: Formula = {
      id: crypto.randomUUID(), formulaId: proposal.displayFormulaId, date: formulaDate,
      name: input.name, notes: '', rows, createdAt: stamp, updatedAt: stamp,
    }
    try {
      formula.provenance = await createProvenance(formula, 'imported', { originType: 'imported' })
      await storage.workspaces.appendWorkspaceAtomic({ formula, versions: [], experiments: [], reviews: [], metaUpdate: proposal.metaUpdate, checkDisplayId: true })
      return formula
    } catch (error) {
      if (error instanceof WorkspaceAppendConflict) continue
      // A primary-key collision is also safe to retry; all other failures remain recoverable.
      try {
        const [active, archived] = await Promise.all([storage.formulas.get(formula.id), storage.archive.list()])
        if (active || archived.some(item => item.id === formula.id)) continue
      } catch { /* Keep the original persistence failure for the UI. */ }
      throw new FormulaPasteCreationError('save-failed')
    }
  }
  throw new FormulaPasteCreationError('concurrent-allocation')
}
