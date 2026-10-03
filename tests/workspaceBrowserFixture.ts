import { engineFixture } from './workspaceEngineFixtures'
import { createProvenance } from '../src/services/provenance'
import { addVariantFromBase, addVariantFromVariant } from '../src/services/experimentLifecycle'
import { toWorkspaceFile } from '../src/services/workspaceExport'

/** Synthetic test data only; loaded by the isolated browser QA profile. */
export async function browserFixture() {
  const { source } = await engineFixture()
  const f = source.formula
  f.name = 'QA Cedar Citrus Study — complete development history'
  f.notes = 'Synthetic QA only. Observe the drydown at 24 hours.'
  f.rows = [
    { id: 'edit-a', rowId: 'logical-row', material: 'Hedione', cas: '24851-98-7', parts: 500, marked: true },
    { id: 'edit-b', rowId: 'qa-b', material: 'Linalool', cas: '78-70-6', parts: 300, dilution: { enabled: true, percent: 10, solvent: 'DPG' } },
    { id: 'edit-c', rowId: 'qa-c', material: 'Iso E Super', cas: '54464-57-2', parts: 200 },
  ]
  const rows = f.rows.map(({ id: _id, ...row }) => row)
  for (const v of source.versions) { v.snapshot.rows = structuredClone(rows); v.snapshot.notes = 'Historical notes'; v.note = v.kind === 'manual' ? 'Baseline proportions' : 'Before restore' }
  const first = source.versions[0]
  source.versions.push({ ...structuredClone(first), versionId: 'manual-2', versionNumber: 2, note: 'Citrus revision' })
  source.versions.push({ ...structuredClone(first), versionId: 'manual-3', versionNumber: 3, note: 'Final QA release' })
  source.versions[2].snapshot.rows = [
    { ...rows[0], parts: 400 }, { ...rows[1], parts: 400 },
    { rowId: 'qa-d', material: 'Benzyl acetate', cas: '140-11-4', parts: 200 },
  ]
  for (const e of source.experiments) {
    e.name = e.baseSource.kind === 'version' ? 'QA Version Study' : 'QA Current Study'
    e.baseSnapshot.rows = structuredClone(rows)
    for (const v of e.variants) {
      v.snapshot.rows = structuredClone(rows); v.note = `QA notes ${v.label}`
      for (const ev of v.evaluations ?? []) ev.snapshot.rows = structuredClone(rows)
    }
  }
  source.experiments[0] = addVariantFromBase(source.experiments[0])
  let current = addVariantFromBase(addVariantFromBase(source.experiments[1]))
  current = addVariantFromVariant(current, current.variants[0].variantId)
  source.experiments[1] = current
  f.provenance = await createProvenance(f, 'created', { originType: 'original', creator: 'QA author', note: 'Synthetic fixture' })
  for (const v of source.versions) { delete v.sourceFingerprint; v.sourceRevisionId = f.provenance.revisions[0].revisionId }
  f.releasedVersionId = 'manual-3'
  return { source, file: toWorkspaceFile(source) }
}
