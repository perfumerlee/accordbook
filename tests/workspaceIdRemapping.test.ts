import { describe, expect, it } from 'vitest'
import { remapWorkspace } from '../src/services/workspaceIdRemapping'
import { verifyWorkspaceProvenance } from '../src/services/workspaceProvenance'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { engineFixture } from './workspaceEngineFixtures'
import { stamp } from './workspaceFixtures'

describe('Scoped Workspace remapping', () => {
  it('maps every runtime edge, preserves historical hashes, row identity, BASE and labels', async () => {
    const { file } = await engineFixture(); const before = structuredClone(file)
    const { records, maps } = remapWorkspace(file, 'LOCAL-2610-999', stamp)
    expect(records.formula.id).not.toBe(file.formula.id)
    expect(records.formula.formulaId).toBe('LOCAL-2610-999')
    expect(records.formula.workspaceImport).toEqual({ sourceFormulaId: file.formula.formulaId, importedAt: stamp })
    expect(records.formula.rows[0].id).not.toBe('editor-only')
    expect(records.formula.rows[0].rowId).toBe(file.formula.rows[0].rowId)
    expect(records.formula.releasedVersionId).toBe(maps.versions.get(file.formula.releasedVersionId!))
    file.versions.forEach((old, i) => {
      const next = records.versions[i]
      expect(next.versionId).not.toBe(old.versionId); expect(next.parentFormulaId).toBe(records.formula.id)
      expect(next.snapshot).toEqual(old.snapshot); expect(next.sourceRevisionId).toBe(old.sourceRevisionId)
    })
    file.experiments.forEach((old, i) => {
      const next = records.experiments[i]
      expect(next.experimentId).not.toBe(old.experimentId); expect(next.baseSnapshot).toEqual(old.baseSnapshot)
      expect(next.parentFormulaId).toBe(records.formula.id)
      if (old.baseSource.kind === 'version') expect(next.baseSource).toEqual({ kind: 'version', sourceVersionId: maps.versions.get(old.baseSource.sourceVersionId) })
      else expect(next.baseSource).toEqual(old.baseSource)
      old.variants.forEach((v, j) => {
        const nv = next.variants[j]
        expect(nv.variantId).not.toBe(v.variantId)
        expect(nv.parentVariantId).toBe(v.parentVariantId === null ? null : maps.variants.get(old.experimentId)!.get(v.parentVariantId))
        expect(nv.snapshot).toEqual(v.snapshot); expect(nv.label).toBe(v.label); expect(nv.intent).toEqual(v.intent)
        v.evaluations?.forEach((ev, k) => { expect(nv.evaluations![k]).toEqual({ ...ev, evaluationId: maps.evaluations.get(old.experimentId)!.get(v.variantId)!.get(ev.evaluationId) }); expect(nv.evaluations![k].evaluationId).not.toBe(ev.evaluationId) })
        if (v.origin) expect(nv.origin).toEqual({ ...v.origin, evaluationId: nv.sourceEvaluationId })
      })
    })
    expect(records.formula.provenance!.recordId).toBe(file.formula.provenance!.recordId)
    expect(records.formula.provenance!.revisions).toEqual(file.formula.provenance!.revisions.map(r => ({ ...r, ...(r.restoredFromVersionId ? { restoredFromVersionId: maps.versions.get(r.restoredFromVersionId) } : {}) })))
    await expect(verifyWorkspaceProvenance(toWorkspaceFile(records))).resolves.toBeUndefined()
    expect(file).toEqual(before)
  })
  it('scopes repeated nested IDs across Experiments/Variants and assigns absent Current rowId once', async () => {
    const { file } = await engineFixture()
    const duplicate = structuredClone(file.experiments[0]); duplicate.experimentId = 'second-experiment'
    file.experiments.push(duplicate)
    file.experiments[0].variants[1].evaluations = structuredClone(file.experiments[0].variants[0].evaluations)
    delete file.formula.rows[0].rowId
    const { records, maps } = remapWorkspace(file, 'NEW', stamp)
    expect(records.formula.rows[0].rowId).toBe('logical-row')
    expect(records.versions[0].snapshot.rows[0].rowId).toBe('logical-row')
    const id = file.experiments[0].variants[0].variantId
    expect(maps.variants.get(file.experiments[0].experimentId)!.get(id)).not.toBe(maps.variants.get(duplicate.experimentId)!.get(id))
    const es = maps.evaluations.get(file.experiments[0].experimentId)!
    const evaluationId = file.experiments[0].variants[0].evaluations![0].evaluationId
    expect(es.get(id)!.get(evaluationId)).not.toBe(es.get(file.experiments[0].variants[1].variantId)!.get(evaluationId))
  })
})
