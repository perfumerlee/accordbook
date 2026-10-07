import { describe, expect, it } from 'vitest'
import type { Experiment, ExperimentVariant } from '../src/models/experiment'
import type { FormulaSnapshotRow } from '../src/models/formula'
import { buildExperimentAiDelta, ExperimentAiDeltaError } from '../src/services/experimentAiDelta'
import { buildExperimentComparisonMatrix, experimentComparisonStates } from '../src/services/experimentComparison'
import type { ExperimentCompareSession } from '../src/services/experimentWorkspaceState'

const row = (rowId: string, material: string, parts: number | '', extra: Partial<FormulaSnapshotRow> = {}): FormulaSnapshotRow => ({ rowId, material, parts, ...extra })
const variant = (variantId: string, label: string, rows: FormulaSnapshotRow[]): ExperimentVariant => ({ variantId, parentVariantId: null, label, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', snapshot: { rows }, note: '' })
const experiment = (baseRows: FormulaSnapshotRow[], variants: ExperimentVariant[]): Experiment => ({ experimentId: 'exp-1', parentFormulaId: 'formula-1', name: 'Study', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', baseSource: { kind: 'current', sourceCurrentUpdatedAt: '2026-01-01T00:00:00.000Z' }, baseSnapshot: { name: 'Study', date: '2026-01-01', notes: '', formulaId: 'ACC-1', rows: baseRows }, nextVariantOrdinal: variants.length, variants })
const session = (...ids: string[]): ExperimentCompareSession => ({ mode: 'navigation', committedIds: ids, draftIds: null })
const build = (baseRows: FormulaSnapshotRow[], variantRows: FormulaSnapshotRow[], ids = ['v1']) => buildExperimentAiDelta(experiment(baseRows, ids.map((id, i) => variant(id, String.fromCharCode(65 + i), variantRows))), session(...ids))
function expectCode(fn: () => unknown, code: string) {
  try { fn(); throw new Error('Expected Delta validation to fail') }
  catch (error) { expect(error).toBeInstanceOf(ExperimentAiDeltaError); expect(error).toMatchObject({ code }) }
}

describe('Experiment AI Delta Engine', () => {
  it('reports identical rows unchanged and keeps source snapshots immutable', () => {
    const source = experiment([row('r1', 'Hedione', 1000)], [variant('v1', 'A', [row('r1', 'Hedione', 1000)])])
    const before = structuredClone(source)
    const result = buildExperimentAiDelta(source, session('v1'))
    expect(result.variants[0].changes).toMatchObject([{ kind: 'unchanged', deltaParts: 0, identityStatus: 'row-lineage' }])
    expect(result.aiEligible).toBe(true)
    expect(source).toEqual(before)
  })

  it('calculates increased and decreased parts as after minus before without rounding', () => {
    const increase = build([row('r', 'Material', 999.875)], [row('r', 'Material', 999.9375)])
    expect(increase.variants[0].changes[0]).toMatchObject({ kind: 'adjusted', deltaParts: 0.0625, changedFields: ['parts'] })
    const decrease = build([row('r', 'Material', 999.9375)], [row('r', 'Material', 999.875)])
    expect(decrease.variants[0].changes[0].deltaParts).toBe(-0.0625)
  })

  it('reports additions and removals with signed before/after deltas', () => {
    const result = build([row('keep', 'Keep', 700), row('gone', 'Gone', 200)], [row('keep', 'Keep', 700), row('new', 'New', 300)])
    expect(result.variants[0].changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'removed', before: expect.objectContaining({ material: 'Gone' }), deltaParts: -200 }),
      expect.objectContaining({ kind: 'added', after: expect.objectContaining({ material: 'New' }), deltaParts: 300 }),
    ]))
  })

  it('classifies a same-lineage material edit as a replacement, not a parts adjustment', () => {
    const result = build([row('r', 'Rose', 400, { cas: '111-11-1' })], [row('r', 'Jasmine', 450, { cas: '222-22-2' })])
    expect(result.variants[0].changes[0]).toMatchObject({ kind: 'replacement', identityStatus: 'replacement-on-lineage', deltaParts: 50, before: { material: 'Rose', parts: 400 }, after: { material: 'Jasmine', parts: 450 }, changedFields: ['material', 'cas', 'parts'] })
    expect(result.variants[0].changes[0].uncertaintyCodes).toContain('ROW_LINEAGE_DOES_NOT_VERIFY_MATERIAL_IDENTITY')
  })

  it('keeps dilution-only changes distinct from replacements', () => {
    const result = build([row('r', 'Material', 1000, { dilution: { enabled: true, percent: 10, solvent: 'ALC' } })], [row('r', 'Material', 1000, { dilution: { enabled: true, percent: 20, solvent: 'ALC' } })])
    expect(result.variants[0].changes[0]).toMatchObject({ kind: 'adjusted', identityStatus: 'row-lineage', deltaParts: 0, changedFields: ['dilution'] })
  })

  it('marks a CAS conflict on the same row lineage as identity-uncertain', () => {
    const result = build([row('r', 'Material', 600, { cas: '111-11-1' })], [row('r', 'Material', 700, { cas: '222-22-2' })])
    expect(result.variants[0].changes[0]).toMatchObject({ kind: 'identity-uncertain', identityStatus: 'conflicting-cas', deltaParts: 100, changedFields: ['cas', 'parts'] })
    expect(result.variants[0].changes[0].uncertaintyCodes).toContain('CAS_CONFLICT')
  })

  it('does not match conflicting CAS values without row lineage', () => {
    const result = build([row('', 'Material', 600, { cas: '111-11-1' })], [row('', 'Material', 700, { cas: '222-22-2' })])
    expect(result.variants[0].changes).toHaveLength(2)
    expect(result.variants[0].changes.map(change => change.kind)).toEqual(['removed', 'added'])
    expect(result.variants[0].changes.every(change => change.identityStatus === 'conflicting-cas')).toBe(true)
  })

  it('supports unique heuristic matching when CAS is missing without claiming verification', () => {
    const result = build([row('', '  Material   X ', 500)], [row('', 'material x', 500, { cas: '123-45-6' })])
    expect(result.variants[0].changes[0]).toMatchObject({ kind: 'adjusted', identityStatus: 'heuristic-match', changedFields: ['cas'], deltaParts: 0 })
    expect(result.variants[0].changes[0].uncertaintyCodes).toContain('HEURISTIC_NAME_MATCH_NOT_VERIFIED')
  })

  it('keeps duplicate material rows separate and reports ambiguous candidates', () => {
    const result = build([row('', 'Musk', 300)], [row('', 'Musk', 200), row('', 'Musk', 100)])
    expect(result.variants[0].changes).toHaveLength(3)
    expect(result.variants[0].changes.every(change => change.identityStatus === 'ambiguous')).toBe(true)
    expect(result.variants[0].changes.map(change => change.deltaParts).reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('matches reordered rows by lineage and preserves row values', () => {
    const result = build([row('a', 'A', 400), row('b', 'B', 600)], [row('b', 'B', 550), row('a', 'A', 450)])
    expect(result.variants[0].changes.map(change => [change.rowId, change.deltaParts])).toEqual([['a', 50], ['b', -50]])
  })

  it('rejects a meaningful row with empty or missing parts as incomplete', () => {
    expectCode(() => build([row('r', 'Material', '')], [row('r', 'Material', 1000)]), 'MISSING_PARTS')
    expectCode(() => build([({ rowId: 'r', material: 'Material' } as unknown as FormulaSnapshotRow)], [row('r', 'Material', 1000)]), 'MISSING_PARTS')
  })

  it('preserves zero as a real value', () => {
    const result = build([row('r', 'Material', 0)], [row('r', 'Material', 0)])
    expect(result.variants[0].changes[0]).toMatchObject({ kind: 'unchanged', before: { parts: 0 }, after: { parts: 0 }, deltaParts: 0 })
    expect(result.aiEligible).toBe(false)
  })

  it('rejects negative, non-finite, malformed material and duplicate row identities', () => {
    expectCode(() => build([row('r', 'Material', -1)], [row('r', 'Material', 1000)]), 'NEGATIVE_PARTS')
    expectCode(() => build([row('r', 'Material', Number.NaN)], [row('r', 'Material', 1000)]), 'NON_FINITE_PARTS')
    expectCode(() => build([row('r', '', 1000)], [row('r', 'Material', 1000)]), 'INVALID_ROW')
    expectCode(() => build([row('r', 'A', 500), row('r', 'B', 500)], [row('v', 'Material', 1000)]), 'DUPLICATE_ROW_ID')
  })

  it('distinguishes incomplete totals and blocks them from future AI use', () => {
    const result = build([row('r', 'Material', 999)], [row('r', 'Material', 998)])
    expect(result.baseComposition).toBe('incomplete')
    expect(result.variants[0].variantComposition).toBe('incomplete')
    expect(result.variants[0].totalDeltaParts).toBe(-1)
    expect(result.aiEligible).toBe(false)
    expect(result.ineligibilityReasons.map(reason => reason.code)).toEqual(['BASE_TOTAL_INCOMPLETE', 'VARIANT_TOTAL_INCOMPLETE'])
  })

  it('accepts complete 1000-part compositions and computes total delta directly', () => {
    const result = build([row('a', 'A', 600), row('b', 'B', 400)], [row('a', 'A', 599.5), row('b', 'B', 400.5)])
    expect(result.aiEligible).toBe(true)
    expect(result.baseTotalParts).toBe(1000)
    expect(result.variants[0].variantTotalParts).toBe(1000)
    expect(result.variants[0].totalDeltaParts).toBe(result.variants[0].variantTotalParts - result.baseTotalParts)
  })

  it('compares BASE against five selected Variants in Comparison Sheet order', () => {
    const variants = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => variant(id, id.toUpperCase(), [row(`${id}-row`, `M${index}`, 1000)]))
    const e = experiment([row('base-row', 'Base', 1000)], variants)
    const selected = session('e', 'b', 'd', 'a', 'c')
    const before = structuredClone(selected)
    const result = buildExperimentAiDelta(e, selected)
    expect(result.variants.map(item => item.variantId)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(selected).toEqual(before)
  })

  it('rejects unknown, repeated, excessive and draft selections instead of dropping them', () => {
    const e = experiment([row('base', 'Base', 1000)], ['a', 'b', 'c', 'd', 'e', 'f'].map(id => variant(id, id, [row(id, id, 1000)])))
    expectCode(() => buildExperimentAiDelta(e, session('missing')), 'UNKNOWN_VARIANT')
    expectCode(() => buildExperimentAiDelta(e, session('a', 'a')), 'DUPLICATE_SELECTION')
    expectCode(() => buildExperimentAiDelta(e, session('a', 'b', 'c', 'd', 'e', 'f')), 'TOO_MANY_VARIANTS')
    expectCode(() => buildExperimentAiDelta(e, { mode: 'compare', committedIds: ['a'], draftIds: ['b'] }), 'INVALID_SELECTION_STATE')
  })

  it('rejects duplicate Variant identities and malformed dilution', () => {
    const duplicate = experiment([row('base', 'Base', 1000)], [variant('a', 'A', [row('a1', 'A', 1000)]), variant('a', 'A2', [row('a2', 'A', 1000)])])
    expectCode(() => buildExperimentAiDelta(duplicate, session('a')), 'DUPLICATE_VARIANT_ID')
    expectCode(() => build([row('r', 'Material', 1000, { dilution: { enabled: true, percent: Number.POSITIVE_INFINITY, solvent: 'ALC' } })], [row('r', 'Material', 1000)]), 'INVALID_ROW')
  })

  it('keeps the existing comparison matrix ordering and matching behavior unchanged', () => {
    const e = experiment([row('r', 'Material', 1000)], [variant('b', 'B', [row('r', 'Material', 900)]), variant('a', 'A', [row('r', 'Material', 800)])])
    const matrix = buildExperimentComparisonMatrix(experimentComparisonStates(e, ['a', 'b']))
    expect(matrix.states.map(state => state.label)).toEqual(['BASE', 'B', 'A'])
    expect(matrix.rows).toHaveLength(1)
    expect(matrix.rows[0].cells.map(cell => cell?.parts)).toEqual([1000, 900, 800])
  })
})
