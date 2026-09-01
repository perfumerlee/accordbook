import type { FormulaMaterial } from '../models/formula'
import type { AccordbookStorage } from '../storage/storageService'
import { createFormula } from './formulaLifecycle'
import { createProvenance } from './provenance'
import type { StarterFormulaTemplate } from '../data/starterFormulas'

export async function createStarterFormula(storage: AccordbookStorage, prefix: string, template: StarterFormulaTemplate) {
  const generated = await createFormula(storage, prefix)
  const rows: FormulaMaterial[] = template.materials.map(({ name, parts }) => ({ id: crypto.randomUUID(), rowId: crypto.randomUUID(), material: name, parts }))
  const formula = { ...generated, name: template.title, notes: template.notes, rows }
  formula.provenance = await createProvenance(formula, 'created', { originType: 'not_specified' })
  await storage.formulas.save(formula)
  return formula
}
