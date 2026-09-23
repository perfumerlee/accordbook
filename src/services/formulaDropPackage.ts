import { parseFormulaFile } from './formulaFile'
import type { FormulaFile } from '../models/formulaFile'

const DROP_ID = /^DROP-\d{4}-\d{3}$/
const MAX_DROP_PACKAGE_BYTES = 16_000_000
export type FormulaDropPackage = { dropId: string; fileName: string; packageType: 'accordbook-formula'; packageText: string; title: string }
export function validateFormulaDropId(dropId: string): boolean { return DROP_ID.test(dropId) }
export function parseFreeFormulaDropPackage(dropId: string, packageText: string, fileName: string, title: string): FormulaDropPackage {
  if (!validateFormulaDropId(dropId) || typeof packageText !== 'string' || new TextEncoder().encode(packageText).byteLength > MAX_DROP_PACKAGE_BYTES) throw new Error('invalid_drop_package')
  let parsed: FormulaFile
  try { parsed = parseFormulaFile(packageText) } catch { throw new Error('invalid_drop_package') }
  if (parsed.type !== 'accordbook-formula' || parsed.formula.name !== title) throw new Error('drop_package_mismatch')
  return { dropId, fileName, packageType: 'accordbook-formula', packageText, title }
}
