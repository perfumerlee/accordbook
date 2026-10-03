import { workspaceFixture, stamp } from './workspaceFixtures'
import { addVariantEvaluation, addVariantFromBase, createExperimentFromCurrent } from '../src/services/experimentLifecycle'
import { appendRevision, createProvenance } from '../src/services/provenance'
import { toWorkspaceFile } from '../src/services/workspaceExport'

export async function engineFixture() {
  const source = await workspaceFixture()
  // Make Batch requires 1,000 total parts. Keep all independent historical snapshots consistent.
  source.formula.rows[0].parts = 1000
  for (const v of source.versions) v.snapshot.rows[0].parts = 1000
  for (const e of source.experiments) {
    e.baseSnapshot.rows[0].parts = 1000
    for (const v of e.variants) {
      v.snapshot.rows[0].parts = 1000
      for (const ev of v.evaluations ?? []) ev.snapshot.rows[0].parts = 1000
    }
  }
  source.formula.provenance = await createProvenance(source.formula, 'created', { originType: 'original', creator: 'Author' })
  for (const v of source.versions) {
    v.sourceRevisionId = source.formula.provenance.revisions[0].revisionId
    v.sourceFingerprint = source.formula.provenance.currentFingerprint
  }
  source.formula = await appendRevision(source.formula, 'restored', undefined, { restoredFromVersionId: 'manual' })
  let e = source.experiments[0]
  e = addVariantEvaluation(e, e.variants[1].variantId, { observation: 'Child observation', verdict: 'uncertain', nextAction: 'Compare' })
  e = addVariantFromBase(e)
  source.experiments[0] = e
  source.experiments.push(createExperimentFromCurrent(source.formula))
  return { source, file: toWorkspaceFile(source, stamp) }
}
