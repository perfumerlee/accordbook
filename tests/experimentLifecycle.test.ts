import { describe, expect, it } from 'vitest'
import type { Formula, FormulaVersion } from '../src/models/formula'
import { addVariantFromBase, addVariantFromVariant, addVariantRow, createExperimentFromCurrent, createExperimentFromVersion, ordinalToVariantLabel, removeVariant, removeVariantRow, updateVariantNote, updateVariantRow, validateExperiment } from '../src/services/experimentLifecycle'

const formula = (): Formula => ({ id: 'formula-1', formulaId: 'ACC-001', date: '2026-09-10', name: 'Study', notes: 'base', rows: [{ id: 'editor-a', rowId: 'row-a', material: 'Hedione', parts: 100, dilution: { enabled: true, percent: 10, solvent: 'DPG' } }, { id: 'editor-b', material: 'Iso E Super', parts: 50 }], createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T01:00:00Z' })

describe('Experiment lifecycle', () => {
  it('creates an owned BASE from CURRENT and normalizes row ids', () => {
    const source = formula(); const experiment = createExperimentFromCurrent(source); expect(experiment.baseSnapshot.notes).toBe('')
    expect(experiment.parentFormulaId).toBe(source.id); expect(experiment.baseSource).toEqual({ kind: 'current', sourceCurrentUpdatedAt: source.updatedAt }); expect(experiment.baseSnapshot.rows.map((row) => row.rowId)).toEqual(['row-a', expect.any(String)]); expect(source.rows[1].rowId).toBeUndefined()
    experiment.baseSnapshot.rows[0].material = 'Changed'; expect(source.rows[0].material).toBe('Hedione')
  })

  it('clones a matching Version and rejects another Formula', () => {
    const source = formula(); const version: FormulaVersion = { versionId: 'version-1', parentFormulaId: source.id, versionNumber: 1, kind: 'manual', createdAt: source.updatedAt, note: '', sourceCurrentUpdatedAt: source.updatedAt, snapshot: { name: 'Saved', date: source.date, notes: '', formulaId: source.formulaId, rows: [{ rowId: 'saved-row', material: 'A', parts: 1 }] } }
    const experiment = createExperimentFromVersion(source, version); expect(experiment.baseSource).toEqual({ kind: 'version', sourceVersionId: 'version-1' }); version.snapshot.rows[0].material = 'Mutated'; expect(experiment.baseSnapshot.rows[0].material).toBe('A'); expect(() => createExperimentFromVersion({ ...source, id: 'other' }, version)).toThrow()
  })

  it('creates independent A/B variants with monotonic labels', () => {
    const base = createExperimentFromCurrent(formula()); const a = addVariantFromBase(base); const b = addVariantFromBase(a); const changed = updateVariantRow(a, a.variants[0].variantId, 'row-a', { parts: 200 });
    expect(changed.variants[0].label).toBe('A'); expect(b.variants[1].label).toBe('B'); expect(b.variants[1].parentVariantId).toBeNull(); expect(changed.variants[0].snapshot.rows[0].parts).toBe(200); expect(b.variants[0].snapshot.rows[0].parts).toBe(100); expect(changed.baseSnapshot.rows[0].parts).toBe(100)
  })

  it('supports child variants through explicit parent ids', () => {
    const experiment = addVariantFromBase(createExperimentFromCurrent(formula())); const parent = experiment.variants[0]; const child = addVariantFromVariant(experiment, parent.variantId); expect(child.variants[1].parentVariantId).toBe(parent.variantId); expect(child.variants[1].variantId).not.toBe(parent.variantId); child.variants[1].snapshot.rows[0].parts = 999; expect(parent.snapshot.rows[0].parts).toBe(100)
  })

  it('normalizes duplicate and blank row ids and assigns new ids to added rows', () => {
    const source = formula(); source.rows = [{ id: '1', rowId: 'same', material: 'A', parts: 1 }, { id: '2', rowId: 'same', material: 'B', parts: 2 }, { id: '3', rowId: ' ', material: 'C', parts: 3 }]; const experiment = createExperimentFromCurrent(source); const ids = experiment.baseSnapshot.rows.map((row) => row.rowId); expect(new Set(ids).size).toBe(3); expect(ids[0]).toBe('same'); const a = addVariantFromBase(experiment); const next = addVariantRow(a, a.variants[0].variantId, { material: 'D', parts: 4 }); expect(next.variants[0].snapshot.rows).toHaveLength(4); const added = next.variants[0].snapshot.rows[3].rowId; const removed = removeVariantRow(next, next.variants[0].variantId, added); const readded = addVariantRow(removed, removed.variants[0].variantId, { material: 'D', parts: 4 }); expect(readded.variants[0].snapshot.rows.at(-1)?.rowId).not.toBe(added)
  })

  it('supports labels beyond Z and pure note updates', () => { expect(ordinalToVariantLabel(0)).toBe('A'); expect(ordinalToVariantLabel(25)).toBe('Z'); expect(ordinalToVariantLabel(26)).toBe('AA'); expect(ordinalToVariantLabel(27)).toBe('AB'); const e = addVariantFromBase(createExperimentFromCurrent(formula())); const updated = updateVariantNote(e, e.variants[0].variantId, 'good diffusion'); expect(updated.variants[0].note).toBe('good diffusion'); expect(e.variants[0].note).toBe('') })

  it('validates parent, unique ids, and parts', () => { const e = addVariantFromBase(createExperimentFromCurrent(formula())); expect(() => addVariantFromVariant(e, 'missing')).toThrow(); expect(() => validateExperiment({ ...e, variants: [{ ...e.variants[0], parentVariantId: e.variants[0].variantId }] })).toThrow(); expect(() => validateExperiment({ ...e, variants: [{ ...e.variants[0], snapshot: { rows: [{ ...e.variants[0].snapshot.rows[0], parts: Number.NaN }, ...e.variants[0].snapshot.rows.slice(1)] } }] })).toThrow(); validateExperiment(e) })
  it('protects siblings and base when editing and deleting variants', () => { const base = createExperimentFromCurrent(formula()); const a = addVariantFromBase(base); const b = addVariantFromBase(a); const edited = updateVariantRow(b, b.variants[0].variantId, 'row-a', { parts: 350, dilution: { enabled: true, percent: 1, solvent: 'IPM' } }); expect(edited.variants[0].snapshot.rows[0].parts).toBe(350); expect(edited.variants[1].snapshot.rows[0].parts).toBe(100); expect(edited.baseSnapshot.rows[0].parts).toBe(100); expect(edited.baseSnapshot.rows[0].dilution?.percent).toBe(10); expect(edited.variants[1].snapshot.rows[0].dilution?.solvent).toBe('DPG'); const removed = removeVariant(edited, edited.variants[0].variantId); expect(removed.variants).toHaveLength(1); expect(removed.variants[0].variantId).toBe(edited.variants[1].variantId) })
  it('rejects deleting a variant that has a child', () => { const parent = addVariantFromBase(createExperimentFromCurrent(formula())); const child = addVariantFromVariant(parent, parent.variants[0].variantId); expect(() => removeVariant(child, parent.variants[0].variantId)).toThrow() })
})
