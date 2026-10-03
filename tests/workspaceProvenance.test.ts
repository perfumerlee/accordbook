import { describe, expect, it, vi } from 'vitest'
import { engineFixture } from './workspaceEngineFixtures'
import { verifyWorkspaceProvenance } from '../src/services/workspaceProvenance'
import { importWorkspace } from '../src/services/workspaceImporter'
import { createStorage } from '../src/storage/storageService'
import { verifyIntegrity } from '../src/services/provenance'
import { toFormulaFile } from '../src/models/formulaFile'
import { createVersionSnapshot } from '../src/services/formulaVersionLifecycle'
import { createBackup } from '../src/services/exportJson'
import { parseBackup } from '../src/services/importJson'
import { duplicateFormula } from '../src/services/formulaLifecycle'

describe('Workspace historical provenance', () => {
  it.each(['revisionHash', 'currentFingerprint', 'composition', 'checkpoint'])('rejects tampered %s before writes', async field => {
    const { file } = await engineFixture(); const storage = await createStorage()
    const p = file.formula.provenance!
    if (field === 'revisionHash') { p.revisions[0].revisionHash = '0'.repeat(64); p.revisions[1].previousRevisionHash = p.revisions[0].revisionHash }
    if (field === 'currentFingerprint') p.currentFingerprint = '0'.repeat(64)
    if (field === 'composition') file.formula.rows[0].parts = 999
    if (field === 'checkpoint') p.checkpoint!.formulaSnapshot = '[]'
    await expect(verifyWorkspaceProvenance(file)).rejects.toThrow('integrity')
    const append = vi.spyOn(storage.workspaces, 'appendWorkspaceAtomic')
    expect(await importWorkspace(storage, file)).toEqual({ ok: false, code: 'invalid-provenance' })
    expect(append).not.toHaveBeenCalled(); expect(await storage.formulas.list()).toEqual([])
  })
  it('preserves historical IDs/hashes and appends a valid imported event atomically', async () => {
    const { file } = await engineFixture(); const storage = await createStorage()
    const result = await importWorkspace(storage, file)
    if (!result.ok) throw new Error(result.code)
    const records = (await storage.workspaces.readWorkspace(result.formulaId))!
    const p = records.formula.provenance!; const old = file.formula.provenance!
    expect(p.recordId).toBe(old.recordId); expect(p.rootRecordId).toBe(old.rootRecordId)
    expect(p.revisions.slice(0, -1).map(r => r.revisionHash)).toEqual(old.revisions.map(r => r.revisionHash))
    expect(p.revisions.slice(0, -1).map(r => r.revisionId)).toEqual(old.revisions.map(r => r.revisionId))
    expect(p.revisions.at(-1)!.eventType).toBe('imported')
    expect(p.revisions.at(-1)!.previousRevisionHash).toBe(old.currentRevisionHash)
    expect(p.revisions[1].restoredFromVersionId).toBe(records.formula.releasedVersionId)
    expect(records.versions.every(v => p.revisions.some(r => r.revisionId === v.sourceRevisionId))).toBe(true)
    expect(await verifyIntegrity(records.formula)).toBe('verified')
  })
  it('keeps import metadata outside Origin, FormulaFile and Version snapshots; documents legacy Backup behavior', async () => {
    const { file } = await engineFixture(); const storage = await createStorage(); const result = await importWorkspace(storage, file)
    if (!result.ok) throw new Error(result.code)
    const f = (await storage.formulas.get(result.formulaId))!
    expect(f.provenance!.claimedSource).toEqual(file.formula.provenance!.claimedSource)
    expect(toFormulaFile(f).formula).not.toHaveProperty('workspaceImport')
    expect(createVersionSnapshot(f)).not.toHaveProperty('workspaceImport')
    expect((await duplicateFormula(storage, f)).workspaceImport).toEqual(f.workspaceImport)
    const backup = await createBackup(storage)
    expect(backup.data.formulas.find(x => x.id === f.id)!.workspaceImport).toEqual(f.workspaceImport)
    expect(parseBackup(JSON.stringify(backup)).data.formulas.find(x => x.id === f.id)?.workspaceImport).toEqual(f.workspaceImport)
  })
})
