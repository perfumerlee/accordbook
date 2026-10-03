import { describe, expect, it } from 'vitest'
import type { WorkspaceFile } from '../src/models/workspaceFile'
import { toWorkspaceFile } from '../src/services/workspaceExport'
import { parseWorkspaceFile } from '../src/services/workspaceImport'
import { validateWorkspaceFile, WORKSPACE_LIMITS } from '../src/services/workspaceValidation'
import { workspaceFixture } from './workspaceFixtures'

const invalid: Array<[string, (f: WorkspaceFile) => void]> = [
  ['wrong type', f => { Object.assign(f, { type: 'accordbook-formula' }) }],
  ['future version', f => { Object.assign(f, { formatVersion: 2 }) }],
  ['bad timestamp', f => { f.exportedAt = 'yesterday' }],
  ['invalid timestamp calendar day', f => { f.exportedAt = '2026-02-30T00:00:00Z' }],
  ['bad date', f => { f.formula.date = '2026-02-30' }],
  ['missing Formula', f => { delete (f as Partial<WorkspaceFile>).formula }],
  ['unknown root credential', f => { Object.assign(f, { sellerToken: 'secret' }) }],
  ['unknown nested credential', f => { Object.assign(f.formula.provenance!.checkpoint!.fingerprint, { pin: 'secret' }) }],
  ['duplicate Version', f => { f.versions.push(f.versions[0]) }],
  ['duplicate Experiment', f => { f.experiments.push(f.experiments[0]) }],
  ['duplicate Variant', f => { f.experiments[0].variants.push(f.experiments[0].variants[0]) }],
  ['duplicate Evaluation', f => { const es = f.experiments[0].variants[0].evaluations!; es.push(es[0]) }],
  ['orphan Version', f => { f.versions[0].parentFormulaId = 'other' }],
  ['orphan Experiment', f => { f.experiments[0].parentFormulaId = 'other' }],
  ['missing BASE', f => { f.experiments[0].baseSource = { kind: 'version', sourceVersionId: 'missing' } }],
  ['third BASE kind', f => { Object.assign(f.experiments[0].baseSource, { kind: 'snapshot' }) }],
  ['missing Branch parent', f => { f.experiments[0].variants[1].parentVariantId = 'missing' }],
  ['self parent', f => { const v = f.experiments[0].variants[0]; v.parentVariantId = v.variantId }],
  ['cycle', f => { const vs = f.experiments[0].variants; vs[0].parentVariantId = vs[3].variantId }],
  ['invalid verdict', f => { Object.assign(f.experiments[0].variants[0].evaluations![0], { verdict: 'winner' }) }],
  ['wrong parent Evaluation', f => { f.experiments[0].variants[1].sourceEvaluationId = 'missing' }],
  ['wrong origin reference', f => { f.experiments[0].variants[1].origin!.evaluationId = 'missing' }],
  ['purpose mismatch', f => { f.experiments[0].variants[1].intent!.branchPurpose = 'check' }],
  ['missing release', f => { f.formula.releasedVersionId = 'missing' }],
  ['restore-point release', f => { f.formula.releasedVersionId = 'restore' }],
  ['manual null number', f => { f.versions[0].versionNumber = null }],
  ['restore numbered', f => { f.versions[1].versionNumber = 2 }],
  ['duplicate manual number', f => { f.versions[1].kind = 'manual'; f.versions[1].versionNumber = 1 }],
  ['invalid dilution', f => { f.formula.rows[0].dilution!.percent = 101 }],
  ['invalid snapshot dilution', f => { f.versions[0].snapshot.rows[0].dilution!.percent = -1 }],
  ['non-finite parts', f => { f.formula.rows[0].parts = Infinity }],
  ['negative parts', f => { f.formula.rows[0].parts = -1 }],
  ['duplicate logical rows', f => { f.versions[0].snapshot.rows.push(f.versions[0].snapshot.rows[0]) }],
  ['missing snapshot rowId', f => { Object.assign(f.versions[0].snapshot.rows[0], { rowId: undefined }) }],
  ['broken revision chain', f => { f.formula.provenance!.revisions[0].previousRevisionHash = 'a'.repeat(64) }],
  ['missing restored Version', f => { f.formula.provenance!.revisions[0].restoredFromVersionId = 'missing' }],
  ['missing source revision', f => { f.versions[0].sourceRevisionId = 'missing' }],
  ['excessive versions', f => { f.versions = Array(WORKSPACE_LIMITS.maxVersions + 1).fill(f.versions[0]) }],
  ['excessive experiments', f => { f.experiments = Array(WORKSPACE_LIMITS.maxExperiments + 1).fill(f.experiments[0]) }],
  ['excessive variants', f => { f.experiments[0].variants = Array(WORKSPACE_LIMITS.maxVariants + 1).fill(f.experiments[0].variants[0]) }],
  ['excessive evaluations', f => { const v = f.experiments[0].variants[0]; v.evaluations = Array(WORKSPACE_LIMITS.maxEvaluations + 1).fill(v.evaluations![0]) }],
  ['excessive revisions', f => { const p = f.formula.provenance!; p.revisions = Array(WORKSPACE_LIMITS.maxRevisions + 1).fill(p.revisions[0]) }],
  ['excessive rows', f => { f.formula.rows = Array(WORKSPACE_LIMITS.maxSnapshotRows + 1).fill(f.formula.rows[0]) }],
  ['excessive string', f => { f.formula.notes = 'x'.repeat(WORKSPACE_LIMITS.maxStringLength + 1) }],
  ['excessive genealogy', f => { const vs = f.experiments[0].variants; const template = vs[3]; f.experiments[0].variants = Array.from({ length: WORKSPACE_LIMITS.maxGenealogyDepth + 1 }, (_, i) => ({ ...template, variantId: `v${i}`, parentVariantId: i ? `v${i - 1}` : null })) }],
]
describe('Workspace strict validation (no storage dependency)', () => {
  it.each(invalid)('rejects %s', async (_name, mutate) => {
    const f = toWorkspaceFile(await workspaceFixture()); mutate(f)
    expect(() => validateWorkspaceFile(f)).toThrow()
    expect(() => parseWorkspaceFile(JSON.stringify(f))).toThrow()
  })
  it('rejects malformed JSON and byte limit before JSON parsing', () => {
    expect(() => parseWorkspaceFile('{')).toThrow('invalid JSON')
    expect(() => parseWorkspaceFile(' '.repeat(WORKSPACE_LIMITS.maxFileBytes + 1))).toThrow('byte limit')
  })
  it('permits scoped Evaluation IDs, reused snapshot rowIds, legacy Branches and empty parts', async () => {
    const f = toWorkspaceFile(await workspaceFixture())
    const vs = f.experiments[0].variants
    vs[2].evaluations = structuredClone(vs[0].evaluations)
    delete vs[1].origin; delete vs[1].evaluationBranchPurpose; delete vs[1].intent
    f.formula.rows[0].parts = ''
    expect(validateWorkspaceFile(f)).toEqual(f)
  })
})
