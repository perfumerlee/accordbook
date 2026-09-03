import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { createStorage } from '../src/storage/storageService'
import { areRestoreSafetyStatesEqual, areVersionSnapshotsEqual, createFormulaVersion, createVersionSnapshot, restoreFormulaVersion } from '../src/services/formulaVersionLifecycle'
import { createProvenance, verifyIntegrity } from '../src/services/provenance'

const makeFormula = (): Formula => ({ id: 'formula-1', formulaId: 'ACC-001', date: '2026-09-03', name: 'Test', notes: 'current', rows: [{ id: 'row-1', rowId: 'stable-row-1', parts: 100, material: 'Hedione', dilution: { enabled: true, percent: 10, solvent: 'ALC' } }], createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z' })

describe('Formula Version lifecycle', () => {
  it('creates independent sequential versions per formula', async () => {
    const storage = await createStorage(); const formula = makeFormula()
    const v1 = await createFormulaVersion(storage, formula, 'first'); const v2 = await createFormulaVersion(storage, formula, 'second')
    expect(v1.versionNumber).toBe(1); expect(v2.versionNumber).toBe(2); expect(v1.versionId).not.toBe(v2.versionId)
    expect(v1.snapshot.rows[0].rowId).toBeTruthy(); expect(v1.snapshot.rows[0]).not.toHaveProperty('marked')
  })

  it('does not share snapshot references with Current or returned objects', async () => {
    const storage = await createStorage(); const formula = makeFormula(); const version = await createFormulaVersion(storage, formula)
    formula.rows[0].parts = 900; formula.rows[0].dilution!.percent = 50; formula.notes = 'changed'
    version.snapshot.rows[0].parts = 1
    const saved = await storage.versions.get(version.versionId)
    expect(saved?.snapshot.rows[0].parts).toBe(100); expect(saved?.snapshot.rows[0].dilution?.percent).toBe(10); expect(saved?.snapshot.notes).toBe('current')
  })

  it('normalizes legacy rows with stable rowIds in snapshots', async () => {
    const storage = await createStorage(); const version = await createFormulaVersion(storage, makeFormula())
    expect(version.snapshot.rows.every((row) => row.rowId.length > 0)).toBe(true)
  })

  it('allows duplicate composition with different notes', async () => {
    const storage = await createStorage(); const formula = makeFormula(); const v1 = await createFormulaVersion(storage, formula, 'immediate'); const v2 = await createFormulaVersion(storage, formula, 'matured')
    expect(v1.sourceFingerprint).toBe(v2.sourceFingerprint); expect((await storage.versions.listByParentFormulaId(formula.id))).toHaveLength(2)
  })

  it('compares the complete Time Machine state while excluding marked', () => {
    const formula = makeFormula(); const base = createVersionSnapshot(formula)
    expect(areVersionSnapshotsEqual(base, createVersionSnapshot({ ...formula, rows: [{ ...formula.rows[0], marked: true }] }))).toBe(true)
    for (const changed of [{ notes: 'changed' }, { name: 'renamed' }, { date: '2026-09-04' }, { rows: [{ ...formula.rows[0], parts: 200 }] }, { rows: [{ ...formula.rows[0], material: 'Iso E Super' }] }, { rows: [{ ...formula.rows[0], cas: '123-45-6' }] }, { rows: [{ ...formula.rows[0], dilution: { enabled: true, percent: 20, solvent: 'ALC' } }] }, { rows: [{ ...formula.rows[0], rowId: 'different-row' }] }, { rows: [{ ...formula.rows[0] }, { id: 'row-2', rowId: 'row-2', parts: 50, material: 'Lemon' }] }]) expect(areVersionSnapshotsEqual(base, createVersionSnapshot({ ...formula, ...changed }))).toBe(false)
  })

  it('restores Current while preserving history and provenance', async () => {
    const storage = await createStorage(); const original = makeFormula(); const formula = { ...original, provenance: await createProvenance(original) }
    const v1 = await createFormulaVersion(storage, formula); const current = { ...formula, notes: 'unsaved experiment', rows: [{ ...formula.rows[0], parts: 700 }] }
    const restored = await restoreFormulaVersion(storage, current, v1)
    expect(restored.id).toBe(formula.id); expect(restored.formulaId).toBe(formula.formulaId); expect(restored.notes).toBe('current'); expect(restored.rows[0].parts).toBe(100)
    expect(await storage.versions.get(v1.versionId)).toEqual(v1); const history = await storage.versions.listByParentFormulaId(formula.id); expect(history.some((v) => v.kind === 'restore-point')).toBe(true); expect(history.find((v) => v.kind === 'restore-point')?.note).toBe('Before restoring v1'); expect(restored.provenance?.revisions[restored.provenance.revisions.length - 1]?.restoredFromVersionId).toBe(v1.versionId); expect(await verifyIntegrity(restored)).toBe('verified')
  })

  it('protects notes, name, date, and meaningful row changes while ignoring placeholders and order', () => {
    const formula = makeFormula(); const base = createVersionSnapshot(formula)
    expect(areRestoreSafetyStatesEqual(base, { ...base, rows: [...base.rows, { rowId: 'blank', material: ' ', cas: ' ', parts: '', dilution: undefined }] })).toBe(true)
    expect(areRestoreSafetyStatesEqual(base, { ...base, rows: [...base.rows].reverse() })).toBe(true)
    for (const changed of [{ notes: 'new notes' }, { name: 'renamed' }, { date: '2026-09-04' }, { rows: [{ ...base.rows[0], parts: 101 }] }, { rows: [{ ...base.rows[0], material: '' , parts: 50 }] }, { rows: [{ ...base.rows[0], material: '', parts: '', cas: '115-95-7' }] }, { rows: [{ ...base.rows[0], material: 'Hedione', parts: 0 }] }]) expect(areRestoreSafetyStatesEqual(base, { ...base, ...changed })).toBe(false)
  })

  it('does not create a safety point for any number of blank placeholders', async () => {
    const storage = await createStorage(); const formula = makeFormula(); const version = await createFormulaVersion(storage, formula)
    const current = { ...formula, rows: [...formula.rows, ...Array.from({ length: 5 }, (_, index) => ({ id: `blank-${index}`, rowId: `blank-${index}`, material: ' ', parts: '' as const, cas: ' ' }))] }
    await restoreFormulaVersion(storage, current, version)
    expect((await storage.versions.listByParentFormulaId(formula.id)).filter((item) => item.kind === 'restore-point')).toHaveLength(0)
  })

  it('treats the editor default shape of zero-parts disabled rows as placeholders', async () => {
    const storage = await createStorage(); const formula = makeFormula(); const version = await createFormulaVersion(storage, formula)
    const current = { ...formula, rows: [...formula.rows, { id: 'default-blank', rowId: 'default-blank', material: '', parts: 0, cas: '', dilution: { enabled: false, percent: 10, solvent: 'ALC' } }] }
    await restoreFormulaVersion(storage, current, version)
    expect((await storage.versions.listByParentFormulaId(formula.id)).filter((item) => item.kind === 'restore-point')).toHaveLength(0)
  })

  it('creates and restores a point for notes-only and unnamed meaningful changes', async () => {
    const storage = await createStorage(); const original = makeFormula(); const formula = { ...original, provenance: await createProvenance(original) }; const version = await createFormulaVersion(storage, formula)
    const current = { ...formula, notes: 'important note', rows: [...formula.rows, { id: 'unnamed', rowId: 'unnamed', material: '', parts: 50 as number }] }
    const restored = await restoreFormulaVersion(storage, current, version); const point = (await storage.versions.listByParentFormulaId(formula.id)).find((item) => item.kind === 'restore-point')
    expect(point?.versionNumber).toBeNull(); expect(point?.snapshot.notes).toBe('important note'); expect(point?.snapshot.rows.some((row) => row.rowId === 'unnamed')).toBe(true)
    expect((await restoreFormulaVersion(storage, restored, point!)).notes).toBe('important note')
  })

  it('preserves identity and rejects a Version from another Formula', async () => {
    const storage = await createStorage(); const formula = makeFormula(); const version = await createFormulaVersion(storage, formula)
    const other = { ...formula, id: 'formula-2', formulaId: 'ACC-002' }
    await expect(restoreFormulaVersion(storage, other, version)).rejects.toThrow('does not belong')
    const restored = await restoreFormulaVersion(storage, { ...formula, name: 'edited' }, version)
    expect(restored.id).toBe(formula.id); expect(restored.formulaId).toBe(formula.formulaId); expect(restored.createdAt).toBe(formula.createdAt); expect(restored.updatedAt).not.toBe(formula.updatedAt)
  })
})
