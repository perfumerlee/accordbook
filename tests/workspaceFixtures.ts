import type { Formula, FormulaVersion } from '../src/models/formula'
import type { WorkspaceSource } from '../src/services/workspaceExport'
import { createProvenance } from '../src/services/provenance'
import { createVersionSnapshot } from '../src/services/formulaVersionLifecycle'
import { addVariantEvaluation, addVariantFromBase, addVariantFromEvaluation, addVariantFromVariant, createExperimentFromVersion } from '../src/services/experimentLifecycle'

export const stamp = '2026-10-01T00:00:00.000Z'
export async function workspaceFixture(): Promise<WorkspaceSource> {
  const formula: Formula = {
    id: 'formula-source', formulaId: 'ACC-2610-001', date: '2026-10-01', name: 'Workspace', notes: 'Private notes',
    createdAt: stamp, updatedAt: stamp, releasedVersionId: 'manual',
    rows: [{ id: 'editor-only', rowId: 'logical-row', material: 'Rose', parts: 100, cas: '123', marked: true, dilution: { enabled: true, percent: 10, solvent: 'DPG' } }],
  }
  Object.assign(formula.rows[0], { memo: 'row memo' })
  formula.provenance = await createProvenance(formula, 'created', { originType: 'original', creator: 'Author', note: 'Origin note' })
  const manual: FormulaVersion = { versionId: 'manual', parentFormulaId: formula.id, versionNumber: 1, kind: 'manual', createdAt: stamp, note: 'Version note', snapshot: createVersionSnapshot(formula), sourceCurrentUpdatedAt: stamp, sourceRevisionId: formula.provenance.revisions[0].revisionId, sourceFingerprint: formula.provenance.currentFingerprint }
  manual.snapshot.rows[0].memo = 'snapshot memo'; manual.snapshot.rows[0].marked = false
  const point: FormulaVersion = { ...structuredClone(manual), versionId: 'restore', kind: 'restore-point', versionNumber: null }
  let experiment = addVariantFromBase(createExperimentFromVersion(formula, manual))
  const parentId = experiment.variants[0].variantId
  experiment = addVariantEvaluation(experiment, parentId, { observation: 'Fresh', verdict: 'continue', nextAction: 'Less rose', decisionNote: 'Try A1' })
  experiment = addVariantEvaluation(experiment, parentId, { observation: 'Later', verdict: 'hold', nextAction: 'Wait' })
  experiment = addVariantFromEvaluation(experiment, parentId, experiment.variants[0].evaluations![0].evaluationId, { branchPurpose: 'development', changeIntent: 'Reduce', hypothesis: 'More space' })
  experiment = addVariantFromVariant(experiment, experiment.variants[1].variantId)
  experiment = addVariantFromVariant(experiment, experiment.variants[2].variantId)
  return { formula, versions: [manual, point], experiments: [experiment] }
}
