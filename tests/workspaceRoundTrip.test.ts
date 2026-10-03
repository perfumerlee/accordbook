import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createStorage } from '../src/storage/storageService'
import { WorkspaceExportCoordinator } from '../src/services/workspaceExportCoordinator'
import { serializeWorkspaceFile, toWorkspaceFile } from '../src/services/workspaceExport'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { importWorkspace } from '../src/services/workspaceImporter'
import { compareFormulaSnapshots } from '../src/services/formulaVersionCompare'
import { buildMultiVersionMatrix, versionComparisonState, currentComparisonState } from '../src/services/multiVersionSheet'
import { getVersionComposition } from '../src/services/versionComposition'
import { calculateScaledBatch } from '../src/services/scaleBatch'
import { buildVariantTree, getVariantParent } from '../src/services/experimentGenealogy'
import { getReleasedVersion } from '../src/services/formulaRelease'
import { engineFixture } from './workspaceEngineFixtures'

afterEach(() => vi.unstubAllGlobals())
describe.each(['memory', 'indexeddb'])('Workspace semantic round-trip: %s', mode => {
  it('prepare → collect → serialize → parse → atomic import preserves research and existing feature models', async () => {
    vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined)
    const sourceStorage = await createStorage(); const { source } = await engineFixture()
    await sourceStorage.workspaces.appendWorkspaceAtomic(source)
    const coordinator = new WorkspaceExportCoordinator()
    coordinator.register({ formulaId: source.formula.id, role: 'formula', blockedReason: () => undefined, flush: async () => undefined })
    const prepared = await coordinator.prepare(sourceStorage, source.formula.id)
    if (!prepared.ready) throw new Error(prepared.reason)
    const original = toWorkspaceFile(prepared.workspace)
    const file = parseWorkspaceFile(serializeWorkspaceFile(original))
    vi.stubGlobal('indexedDB', mode === 'indexeddb' ? new IDBFactory() : undefined)
    const destination = await createStorage()
    const imported = await importWorkspace(destination, file)
    if (!imported.ok) throw new Error(imported.code)
    const records = (await destination.workspaces.readWorkspace(imported.formulaId))!
    const manual = records.versions.find(v => v.kind === 'manual')!
    const restore = records.versions.find(v => v.kind === 'restore-point')!
    expect(getReleasedVersion(records.formula, records.versions)).toEqual(manual)
    expect(compareFormulaSnapshots(manual.snapshot, restore.snapshot).summary.changed).toBe(0)
    const sheet = buildMultiVersionMatrix([versionComparisonState(manual), versionComparisonState(restore), currentComparisonState(records.formula)])
    expect(sheet.states).toHaveLength(3); expect(sheet.rows).toHaveLength(1)
    expect(getVersionComposition(manual.snapshot)).toEqual(['Rose'])
    expect(calculateScaledBatch(manual.snapshot.rows, 10).totalGrams).toBe(10)
    const exp = records.experiments.find(e => e.baseSource.kind === 'version')!
    expect(exp.baseSource).toEqual({ kind: 'version', sourceVersionId: manual.versionId })
    expect(buildVariantTree(exp)).toHaveLength(2)
    const branch = exp.variants[1]; const parent = getVariantParent(exp, branch.variantId)!
    expect(parent.evaluations!.some(e => e.evaluationId === branch.sourceEvaluationId)).toBe(true)
    expect(branch.origin!.evaluationId).toBe(branch.sourceEvaluationId)

    // Normalize only explicitly regenerated identities and the appended local event.
    const normalized = toWorkspaceFile(records, original.exportedAt)
    const versionMap = new Map(records.versions.map(v => [v.versionId, original.versions.find(old => old.kind === v.kind && old.versionNumber === v.versionNumber)!.versionId]))
    normalized.formula.id = original.formula.id; normalized.formula.formulaId = original.formula.formulaId
    normalized.formula.releasedVersionId = versionMap.get(normalized.formula.releasedVersionId!)
    const p = normalized.formula.provenance!
    p.revisions.pop(); p.currentRevisionHash = p.revisions[p.revisions.length - 1].revisionHash
    for (const r of p.revisions) if (r.restoredFromVersionId) r.restoredFromVersionId = versionMap.get(r.restoredFromVersionId)!
    normalized.versions.forEach(v => { v.versionId = versionMap.get(v.versionId)!; v.parentFormulaId = original.formula.id })
    normalized.versions.sort((a, b) => original.versions.findIndex(v => v.versionId === a.versionId) - original.versions.findIndex(v => v.versionId === b.versionId))
    for (const e of normalized.experiments) {
      const old = original.experiments.find(x => x.baseSource.kind === e.baseSource.kind)!
      const variants = new Map(e.variants.map((v, i) => [v.variantId, old.variants[i].variantId]))
      const evaluations = new Map(e.variants.map((v, i) => [v.variantId, new Map((v.evaluations ?? []).map((ev, k) => [ev.evaluationId, old.variants[i].evaluations![k].evaluationId]))]))
      e.experimentId = old.experimentId; e.parentFormulaId = original.formula.id
      if (e.baseSource.kind === 'version') e.baseSource.sourceVersionId = versionMap.get(e.baseSource.sourceVersionId)!
      for (const v of e.variants) {
        if (v.sourceEvaluationId) v.sourceEvaluationId = evaluations.get(v.parentVariantId!)!.get(v.sourceEvaluationId)!
        if (v.origin) v.origin.evaluationId = v.sourceEvaluationId!
        for (const ev of v.evaluations ?? []) ev.evaluationId = evaluations.get(v.variantId)!.get(ev.evaluationId)!
        if (v.parentVariantId) v.parentVariantId = variants.get(v.parentVariantId)!
        v.variantId = variants.get(v.variantId)!
      }
    }
    normalized.experiments.sort((a, b) => original.experiments.findIndex(e => e.experimentId === a.experimentId) - original.experiments.findIndex(e => e.experimentId === b.experimentId))
    expect(normalized).toEqual(original)
  })
})
