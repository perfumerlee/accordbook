import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Formula, FormulaVersion } from '../src/models/formula'
import { createStorage } from '../src/storage/storageService'
import { createFormulaVersion, restoreFormulaVersion } from '../src/services/formulaVersionLifecycle'
import { archiveFormula, restoreFormula, deleteArchivedFormula, createFormulaFromVersion, duplicateFormula } from '../src/services/formulaLifecycle'
import { getReleasedVersion } from '../src/services/formulaRelease'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import { toFormulaFile } from '../src/models/formulaFile'
import { VersionReleaseStatus } from '../src/components/VersionReleaseStatus'
import { createProvenance } from '../src/services/provenance'

async function setup() {
  const storage = await createStorage()
  const formula: Formula = { id: 'f', formulaId: 'ACC-001', name: 'Original', date: '2026-09-07', notes: 'Notes', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z', rows: [{ id: 'r', rowId: 'r', material: 'Hedione', parts: 1000 }] }
  formula.provenance = await createProvenance(formula, 'provenance_initialized', { originType: 'unknown' })
  await storage.formulas.save(formula)
  const v1 = await createFormulaVersion(storage, formula)
  const v2 = await createFormulaVersion(storage, formula)
  return { storage, formula: (await storage.formulas.get('f'))!, v1, v2 }
}

describe('Released version metadata', () => {
  it('starts without a release and preserves contents, provenance, timestamp and versions on release', async () => {
    const { storage, formula, v1, v2 } = await setup()
    expect(formula).not.toHaveProperty('releasedVersionId')
    const before = await storage.versions.listAll()
    const released = await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    expect(released).toEqual({ ...formula, releasedVersionId: v1.versionId })
    expect(await storage.formulas.get(formula.id)).toEqual(released)
    const replaced = await storage.formulas.markReleasedVersion(formula.id, v2.versionId)
    expect(replaced).toEqual({ ...formula, releasedVersionId: v2.versionId })
    expect(getReleasedVersion(replaced, before)?.versionId).toBe(v2.versionId)
    expect(await storage.versions.listAll()).toEqual(before)
  })
  it('rejects nonexistent, unrelated and restore-point versions without changing data', async () => {
    const { storage, formula, v1 } = await setup()
    await storage.versions.save({ ...v1, versionId: 'other', parentFormulaId: 'other' })
    await storage.versions.save({ ...v1, versionId: 'point', kind: 'restore-point', versionNumber: null })
    for (const id of ['missing', 'other', 'point']) await expect(storage.formulas.markReleasedVersion(formula.id, id)).rejects.toThrow()
    expect(await storage.formulas.get(formula.id)).toEqual(formula)
    await expect(storage.formulas.markReleasedVersion('missing', v1.versionId)).rejects.toThrow()
  })
  it('new saves and stale content autosaves do not replace the release', async () => {
    const { storage, formula, v1, v2 } = await setup()
    await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    await createFormulaVersion(storage, formula)
    await storage.formulas.markReleasedVersion(formula.id, v2.versionId)
    await storage.formulas.save({ ...formula, notes: 'Edited', releasedVersionId: v1.versionId })
    expect((await storage.formulas.get(formula.id))?.releasedVersionId).toBe(v2.versionId)
    expect((await storage.versions.get(v1.versionId))?.snapshot.notes).toBe('Notes')
  })
  it('restore preserves release and new identities never inherit it', async () => {
    const { storage, formula, v1, v2 } = await setup()
    const released = await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    expect((await restoreFormulaVersion(storage, released, v2)).releasedVersionId).toBe(v1.versionId)
    const created = await createFormulaFromVersion(storage, v1)
    const duplicate = await duplicateFormula(storage, released)
    for (const copy of [created, duplicate]) {
      expect(copy.releasedVersionId).toBeUndefined()
      expect(copy.id).not.toBe(formula.id)
      expect(await storage.versions.listByParentFormulaId(copy.id)).toEqual([])
    }
  })
  it('blocks released deletion in active/archive stores but permits non-released and permanent formula deletion', async () => {
    const { storage, formula, v1, v2 } = await setup()
    const released = await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    await expect(storage.versions.delete(v1.versionId)).rejects.toThrow('released version')
    await expect(storage.versions.deleteByParentFormulaId(formula.id)).rejects.toThrow('released version')
    await storage.versions.delete(v2.versionId)
    expect(await storage.versions.get(v2.versionId)).toBeUndefined()
    await archiveFormula(storage, released)
    expect((await storage.archive.get(formula.id))?.releasedVersionId).toBe(v1.versionId)
    await expect(storage.versions.delete(v1.versionId)).rejects.toThrow('released version')
    await restoreFormula(storage, (await storage.archive.get(formula.id))!)
    expect((await storage.formulas.get(formula.id))?.releasedVersionId).toBe(v1.versionId)
    await archiveFormula(storage, released)
    await deleteArchivedFormula(storage, formula.id)
    expect(await storage.archive.get(formula.id)).toBeUndefined()
    expect(await storage.versions.listByParentFormulaId(formula.id)).toEqual([])
  })
  it('replacement permits deleting the previous release', async () => {
    const { storage, formula, v1, v2 } = await setup()
    await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    await storage.formulas.markReleasedVersion(formula.id, v2.versionId)
    await storage.versions.delete(v1.versionId)
    expect(await storage.versions.get(v1.versionId)).toBeUndefined()
  })
  it.each([false, true])('backup roundtrip preserves release, archived=%s', async archived => {
    const { storage, formula, v1 } = await setup()
    const released = await storage.formulas.markReleasedVersion(formula.id, v1.versionId)
    if (archived) await archiveFormula(storage, released)
    const backup = parseBackup(JSON.stringify(await createBackup(storage)))
    expect((archived ? backup.data.archive : backup.data.formulas)[0].releasedVersionId).toBe(v1.versionId)
    const target = await createStorage()
    await importBackup(target, backup)
    expect((await (archived ? target.archive : target.formulas).get(formula.id))?.releasedVersionId).toBe(v1.versionId)
    expect(backup.formatVersion).toBe(2)
  })
  it('imports old backup and rejects malformed release references', async () => {
    const { storage } = await setup()
    const backup = await createBackup(storage)
    expect(parseBackup(JSON.stringify(backup)).data.formulas[0].releasedVersionId).toBeUndefined()
    for (const value of [42, '', 'missing']) {
      const raw = JSON.parse(JSON.stringify(backup))
      raw.data.formulas[0].releasedVersionId = value
      expect(() => parseBackup(JSON.stringify(raw))).toThrow()
    }
  })
  it('normal formula file excludes release metadata', async () => {
    const { formula, v1 } = await setup()
    expect(JSON.stringify(toFormulaFile({ ...formula, releasedVersionId: v1.versionId }))).not.toContain('releasedVersionId')
  })
  it('invalid pointers fail safely for rendering without rewriting input', async () => {
    const { formula, v1 } = await setup()
    for (const version of [{ ...v1, parentFormulaId: 'other' }, { ...v1, kind: 'restore-point' as const }]) {
      expect(getReleasedVersion({ ...formula, releasedVersionId: v1.versionId }, [version])).toBeUndefined()
    }
    expect(getReleasedVersion({ ...formula, releasedVersionId: 'missing' }, [v1])).toBeUndefined()
  })
  it.each(['en', 'ko'] as const)('renders eligibility and English product status in %s', async language => {
    const { formula, v1 } = await setup()
    const render = (f: Formula, version: FormulaVersion) => renderToStaticMarkup(createElement(VersionReleaseStatus, { formula: f, version, versions: [v1], language, onConfirm: async () => {} }))
    expect(render(formula, v1)).toContain('RELEASE THIS VERSION')
    expect(render({ ...formula, releasedVersionId: v1.versionId }, v1)).toContain('RELEASED')
    expect(render({ ...formula, releasedVersionId: v1.versionId }, v1)).not.toContain('RELEASE THIS VERSION')
    expect(render(formula, { ...v1, kind: 'restore-point', versionNumber: null })).toBe('')
  })
})
