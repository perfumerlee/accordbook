import type { Formula, FormulaMaterial } from '../models/formula'
import type { AIContextRowV1, AIContextV1 } from '../models/aiContext'

export interface AIContextOptions {
  readonly includeName?: boolean
  readonly includeNotes?: boolean
}

export type AIContextErrorCode = 'EMPTY_FORMULA' | 'INCOMPLETE_ROW' | 'INVALID_PARTS' | 'INVALID_DILUTION' | 'INVALID_MATERIAL' | 'INVALID_OPTIONAL_TEXT'
export interface AIContextIssue {
  readonly code: AIContextErrorCode
  /** Zero-based source row position; never a Core ID or content value. */
  readonly rowIndex?: number
}
export interface AIContextWarning {
  readonly code: 'INVALID_CAS_REFERENCE'
  readonly rowIndex: number
}
export type AIContextBuildResult =
  | { readonly ok: true; readonly context: AIContextV1; readonly warnings: readonly AIContextWarning[] }
  | { readonly ok: false; readonly error: AIContextIssue }

type FormulaInput = Readonly<Omit<Formula, 'rows'>> & {
  readonly rows: readonly (Readonly<Omit<FormulaMaterial, 'dilution'>> & {
    readonly dilution?: Readonly<NonNullable<FormulaMaterial['dilution']>>
  })[]
}

/** Local syntax/checksum policy only. No resolver, registry, or network lookup. */
function validCas(value: string): boolean {
  if (!/^[1-9]\d{1,6}-\d{2}-\d$/.test(value)) return false
  const digits = value.replace(/-/g, '')
  let sum = 0
  for (let i = digits.length - 2, weight = 1; i >= 0; i--, weight++) sum += Number(digits[i]) * weight
  return sum % 10 === Number(digits[digits.length - 1])
}

/** Pure projection of one selected Formula; not an HTTP/untrusted-object parser.
 * First invalid row wins, in source order. Warnings contain no source text.
 * Only fully blank editing rows are omitted; zero is an explicit quantity.
 */
export function buildAIContext(formula: FormulaInput, options: AIContextOptions = {}): AIContextBuildResult {
  const rows: AIContextRowV1[] = []
  const warnings: AIContextWarning[] = []
  const fail = (code: AIContextErrorCode, rowIndex?: number): AIContextBuildResult => ({
    ok: false, error: rowIndex === undefined ? { code } : { code, rowIndex },
  })

  for (const [rowIndex, row] of formula.rows.entries()) {
    if (typeof row.material !== 'string') return fail('INVALID_MATERIAL', rowIndex)
    const material = row.material
    const cas = typeof row.cas === 'string' ? row.cas.trim() : ''
    const hasReference = row.cas !== undefined && (typeof row.cas !== 'string' || cas !== '')
    if (!material.trim() && row.parts === '' && !hasReference && row.dilution === undefined && row.marked !== true) continue
    if (!material.trim() || row.parts === '') return fail('INCOMPLETE_ROW', rowIndex)
    if (typeof row.parts !== 'number' || !Number.isFinite(row.parts) || row.parts < 0) return fail('INVALID_PARTS', rowIndex)

    let dilution: AIContextRowV1['dilution']
    if (row.dilution !== undefined) {
      if (!row.dilution || typeof row.dilution.enabled !== 'boolean') return fail('INVALID_DILUTION', rowIndex)
      if (row.dilution.enabled) {
        const { percent, solvent } = row.dilution
        if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100 || typeof solvent !== 'string' || !solvent.trim()) return fail('INVALID_DILUTION', rowIndex)
        dilution = Object.freeze({ percent, solvent })
      }
    }

    const projected: { material: string; parts: number; cas?: string; dilution?: AIContextRowV1['dilution'] } = { material, parts: row.parts }
    if (cas && validCas(cas)) projected.cas = cas
    else if (hasReference) warnings.push({ code: 'INVALID_CAS_REFERENCE', rowIndex })
    if (dilution) projected.dilution = dilution
    rows.push(Object.freeze(projected))
  }

  if (!rows.length) return fail('EMPTY_FORMULA')
  const projectedFormula: { rows: readonly AIContextRowV1[]; name?: string; notes?: string } = { rows: Object.freeze(rows) }
  if (options.includeName === true) {
    if (typeof formula.name !== 'string') return fail('INVALID_OPTIONAL_TEXT')
    projectedFormula.name = formula.name
  }
  if (options.includeNotes === true) {
    if (typeof formula.notes !== 'string') return fail('INVALID_OPTIONAL_TEXT')
    projectedFormula.notes = formula.notes
  }
  // Freeze only newly owned DTO objects, never the source domain objects.
  const context: AIContextV1 = Object.freeze({
    type: 'accordbook-ai-context', version: 1, scope: 'formula_review',
    formula: Object.freeze(projectedFormula),
  })
  return { ok: true, context, warnings: Object.freeze(warnings.map(warning => Object.freeze(warning))) }
}
