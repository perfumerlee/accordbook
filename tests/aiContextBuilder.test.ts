import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Formula, FormulaMaterial } from '../src/models/formula'
import { buildAIContext } from '../src/services/aiContextBuilder'

const row = (changes: Partial<FormulaMaterial> = {}): FormulaMaterial => ({ id: 'row-private', material: 'Benzyl acetate', parts: 100, ...changes })
const formula = (rows = [row()]): Formula => ({ id: 'private-id', formulaId: 'ACC-private', date: '2026-10-05', name: 'Private project', notes: 'Private notes', createdAt: 'private-created', updatedAt: 'private-updated', rows })
const context = (source: Formula, options = {}) => {
  const result = buildAIContext(source, options)
  if (!result.ok) throw new Error(result.error.code)
  return result.context
}
afterEach(() => vi.unstubAllGlobals())

describe('AI context allowlist and row semantics', () => {
  it('projects the minimal Formula into the independent contract', () => {
    expect(context(formula())).toEqual({ type: 'accordbook-ai-context', version: 1, scope: 'formula_review', formula: { rows: [{ material: 'Benzyl acetate', parts: 100 }] } })
  })
  it('preserves multiple materials, duplicate names, order, and fractional parts', () => {
    const rows = [row({ material: 'Z', parts: 12.5 }), row({ material: 'A', parts: 30 }), row({ material: 'Z', parts: 40 })]
    expect(context(formula(rows)).formula.rows).toEqual(rows.map(({ material, parts }) => ({ material, parts })))
  })
  it.each([0, 500, 1000, 1500])('preserves %s parts without normalization', parts => {
    expect(context(formula([row({ parts })])).formula.rows[0].parts).toBe(parts)
  })
  it('omits only completely empty editing rows', () => {
    expect(context(formula([row({ material: '  ', parts: '', cas: ' ' }), row()])).formula.rows).toHaveLength(1)
  })
  it.each([{ rows: [] }, { rows: [row({ material: '', parts: '' })] }])('reports an empty Formula', ({ rows }) => {
    expect(buildAIContext(formula(rows))).toEqual({ ok: false, error: { code: 'EMPTY_FORMULA' } })
  })
  it.each([
    row({ parts: '' }),
    row({ material: '', parts: '', cas: '140-11-4' }),
    row({ material: '', parts: '', cas: 'internal reference' }),
    row({ material: '', parts: '', dilution: { enabled: true, percent: 10, solvent: 'ALC' } }),
    row({ material: '', parts: '', dilution: { enabled: false, percent: 10, solvent: 'ALC' } }),
    row({ material: '', parts: '', marked: true }),
    row({ material: '', parts: 0 }),
    row({ material: '   ', parts: 10 }),
  ])('rejects incomplete meaningful rows without dropping them', incomplete => {
    expect(buildAIContext(formula([row(), incomplete]))).toEqual({ ok: false, error: { code: 'INCOMPLETE_ROW', rowIndex: 1 } })
  })
  it.each([NaN, Infinity, -Infinity, -1, '10', null])('rejects invalid parts %s', parts => {
    expect(buildAIContext(formula([row({ parts: parts as number })]))).toEqual({ ok: false, error: { code: 'INVALID_PARTS', rowIndex: 0 } })
  })
  it('rejects non-string material', () => {
    expect(buildAIContext(formula([row({ material: null as unknown as string })]))).toEqual({ ok: false, error: { code: 'INVALID_MATERIAL', rowIndex: 0 } })
  })
  it('returns only the first error in source order, without sensitive values', () => {
    expect(buildAIContext(formula([row({ parts: '' }), row({ parts: NaN })]))).toEqual({ ok: false, error: { code: 'INCOMPLETE_ROW', rowIndex: 0 } })
  })
})

describe('dilution and CAS', () => {
  it.each([0, 10, 100])('preserves active dilution at %s percent and original solution parts', percent => {
    expect(context(formula([row({ dilution: { enabled: true, percent, solvent: 'ALC' } })])).formula.rows[0]).toEqual({ material: 'Benzyl acetate', parts: 100, dilution: { percent, solvent: 'ALC' } })
  })
  it('omits disabled dilution even if its inactive values are incomplete', () => {
    expect(context(formula([row({ dilution: { enabled: false, percent: NaN, solvent: '' } })])).formula.rows[0]).not.toHaveProperty('dilution')
  })
  it.each([
    { enabled: true, percent: NaN, solvent: 'ALC' },
    { enabled: true, percent: Infinity, solvent: 'ALC' },
    { enabled: true, percent: -1, solvent: 'ALC' },
    { enabled: true, percent: 101, solvent: 'ALC' },
    { enabled: true, percent: 10, solvent: ' ' },
    { enabled: true, percent: '10', solvent: 'ALC' },
    { enabled: true, percent: 10, solvent: null },
    { percent: 10, solvent: 'ALC' },
    null,
  ])('rejects invalid active dilution or enabled flag', dilution => {
    expect(buildAIContext(formula([row({ dilution: dilution as FormulaMaterial['dilution'] })]))).toEqual({ ok: false, error: { code: 'INVALID_DILUTION', rowIndex: 0 } })
  })
  it.each(['140-11-4', '64-17-5', ' 140-11-4 '])('includes syntax/checksum-valid CAS %s', cas => {
    expect(context(formula([row({ cas })])).formula.rows[0].cas).toBe(cas.trim())
  })
  it.each([undefined, '', ' '])('does not resolve missing CAS', cas => {
    const result = buildAIContext(formula([row({ cas })]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.formula.rows[0]).not.toHaveProperty('cas')
      expect(result.warnings).toEqual([])
    }
  })
  it.each(['vendor-ref-private', '140-11-5', '0140-11-4', '1-11-1', '12345678-11-1'])('omits invalid reference with a content-free warning', cas => {
    const result = buildAIContext(formula([row({ cas })]))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.formula.rows[0]).not.toHaveProperty('cas')
      expect(result.warnings).toEqual([{ code: 'INVALID_CAS_REFERENCE', rowIndex: 0 }])
      expect(JSON.stringify(result)).not.toContain(cas)
    }
  })
})

describe('privacy and immutable ownership', () => {
  it('excludes name and notes by default and with explicit false', () => {
    for (const options of [{}, { includeName: false, includeNotes: false }]) {
      expect(context(formula(), options).formula).not.toHaveProperty('name')
      expect(context(formula(), options).formula).not.toHaveProperty('notes')
    }
  })
  it.each(['includeName', 'includeNotes'] as const)('includes only the explicitly selected text via %s', option => {
    const projected = context(formula(), { [option]: true }).formula
    expect(projected).toHaveProperty(option === 'includeName' ? 'name' : 'notes', option === 'includeName' ? 'Private project' : 'Private notes')
    expect(projected).not.toHaveProperty(option === 'includeName' ? 'notes' : 'name')
  })
  it('preserves selected text and material/solvent without repairing them', () => {
    const source = formula([row({ material: ' Material ', dilution: { enabled: true, percent: 10, solvent: ' ALC ' } })])
    source.name = ''; source.notes = '  notes\n'
    expect(context(source, { includeName: true, includeNotes: true }).formula).toEqual({ name: '', notes: '  notes\n', rows: [{ material: ' Material ', parts: 100, dilution: { percent: 10, solvent: ' ALC ' } }] })
  })
  it('rejects invalid optional text only when selected', () => {
    const source = formula(); source.notes = null as unknown as string
    expect(buildAIContext(source).ok).toBe(true)
    expect(buildAIContext(source, { includeNotes: true })).toEqual({ ok: false, error: { code: 'INVALID_OPTIONAL_TEXT' } })
  })
  it('does not mutate or freeze input, and owns every nested output object', () => {
    const source = formula([row({ dilution: { enabled: true, percent: 10, solvent: 'ALC' } })])
    const before = structuredClone(source)
    const output = context(source)
    expect(source).toEqual(before)
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(source.rows[0].dilution)).toBe(false)
    expect(output.formula.rows).not.toBe(source.rows)
    expect(output.formula.rows[0]).not.toBe(source.rows[0])
    expect(output.formula.rows[0].dilution).not.toBe(source.rows[0].dilution)
    for (const value of [output, output.formula, output.formula.rows, output.formula.rows[0], output.formula.rows[0].dilution]) expect(Object.isFrozen(value)).toBe(true)
    source.rows[0].dilution!.percent = 50
    source.rows[0].material = 'Changed'
    expect(output.formula.rows[0].dilution!.percent).toBe(10)
    expect(output.formula.rows[0].material).toBe('Benzyl acetate')
  })
  it('does not mutate invalid source data on failure', () => {
    const source = formula([row({ parts: NaN })]); const before = structuredClone(source)
    expect(buildAIContext(source).ok).toBe(false)
    expect(source).toEqual(before)
  })
  it('privacy canary: no private or unknown fields leave Core', () => {
    const source = Object.assign(formula(), {
      id: 'CANARY_runtime', formulaId: 'CANARY_display', name: 'CANARY_name', notes: 'CANARY_notes',
      date: 'CANARY_date', createdAt: 'CANARY_created', updatedAt: 'CANARY_updated', archivedAt: 'CANARY_archived',
      workspaceImport: { sourceFormulaId: 'CANARY_import', importedAt: 'CANARY_import_time' },
      releasedVersionId: 'CANARY_released', provenance: { claimedSource: { title: 'CANARY_origin' }, revisions: ['CANARY_revision'], currentFingerprint: 'CANARY_fingerprint', currentRevisionHash: 'CANARY_hash' },
      versions: ['CANARY_version'], experiments: ['CANARY_experiment'], variants: ['CANARY_variant'], branches: ['CANARY_branch'], evaluations: ['CANARY_evaluation'],
      customer: 'CANARY_customer', settings: 'CANARY_settings', authentication: 'CANARY_auth', license: 'CANARY_license', dropIdentity: 'CANARY_drop', activeFormulaId: 'CANARY_active', storage: 'CANARY_storage', unrelatedFormula: 'CANARY_other', metadata: 'CANARY_meta',
    }) as unknown as Formula
    source.rows = [Object.assign(row({ cas: '140-11-4', dilution: { enabled: true, percent: 10, solvent: 'ALC' } }), { id: 'CANARY_row', rowId: 'CANARY_rowId', marked: true, memo: 'CANARY_memo' })]
    Object.assign(source.rows[0].dilution!, { secret: 'CANARY_dilution' })
    const before = structuredClone(source)
    expect(JSON.stringify(buildAIContext(source))).not.toContain('CANARY_')
    expect(context(source).formula.rows[0]).toEqual({ material: 'Benzyl acetate', parts: 100, cas: '140-11-4', dilution: { percent: 10, solvent: 'ALC' } })
    expect(source).toEqual(before)
  })
})

describe('Core isolation', () => {
  it('has only type imports, with no executable dependency or dynamic loading', () => {
    for (const name of ['src/models/aiContext.ts', 'src/services/aiContextBuilder.ts']) {
      const source = readFileSync(name, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      // Deliberately narrow source guard: these foundation modules may only
      // reference the two domain/DTO types, never executable modules.
      const withoutAllowedImports = source.replace(/import\s+type\s*\{[^}]*\}\s*from\s*['"]\.\.\/models\/(?:formula|aiContext)['"];?/g, '')
      expect(withoutAllowedImports).not.toMatch(/\bimport\b|\bexport\s+(?:\*|\{)|\b(?:require|eval|Function)\s*\(/)
      expect(withoutAllowedImports).not.toMatch(/\b(?:window|document|globalThis|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|Worker|console|navigator|process)\b/)
    }
  })
  it('does not access browser storage, network, analytics, or console on success/failure', () => {
    const forbidden = vi.fn(() => { throw new Error('Forbidden side effect') })
    const trap = new Proxy({}, { get: forbidden, set: forbidden })
    for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'console']) vi.stubGlobal(key, trap)
    for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'Worker']) vi.stubGlobal(key, forbidden)
    const source = formula(); const before = structuredClone(source)
    const success = buildAIContext(source)
    const failure = buildAIContext(formula([row({ parts: '' })]))
    vi.unstubAllGlobals()
    expect(success.ok).toBe(true); expect(failure.ok).toBe(false)
    expect(forbidden).not.toHaveBeenCalled()
    expect(source).toEqual(before)
  })
})
