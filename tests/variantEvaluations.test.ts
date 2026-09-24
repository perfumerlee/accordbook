import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { addVariantEvaluation, addVariantFromBase, addVariantFromEvaluation, addVariantFromVariant, createExperimentFromCurrent, removeVariantEvaluation, updateVariantEvaluation, updateVariantRow, validateExperiment } from '../src/services/experimentLifecycle'
import { createStorage } from '../src/storage/storageService'
import { createBackup } from '../src/services/exportJson'
import { importBackup, parseBackup } from '../src/services/importJson'
import { evaluationBranchPurpose } from '../src/services/evaluationDirection'

const formula: Formula = { id: 'f', formulaId: 'ACC-001', name: 'Study', date: '2026-09-25', notes: '', createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z', rows: [{ id: 'r', rowId: 'r', material: 'Hedione', cas: '24851-98-7', parts: 1000, dilution: { enabled: true, percent: 10, solvent: 'DPG' } }] }
const input = { observation: 'More transparent', verdict: 'continue' as const, nextAction: 'Try less wood' }
const setup = () => {
  const base = addVariantFromBase(createExperimentFromCurrent(formula))
  return addVariantEvaluation(base, base.variants[0].variantId, input)
}

describe('Variant evaluations', () => {
  it.each([
    ['continue', 'development'], ['hold', 'check'], ['uncertain', 'comparison'], ['stop', undefined],
  ] as const)('applies the %s direction to Branch creation', (verdict, purpose) => {
    const original = setup(), variant = original.variants[0], evaluation = variant.evaluations![0]
    const changed = updateVariantEvaluation(original, variant.variantId, evaluation.evaluationId, { ...input, verdict, decisionNote: 'Decision context' })
    expect(evaluationBranchPurpose(verdict)).toBe(purpose)
    if (!purpose) {
      expect(() => addVariantFromEvaluation(changed, variant.variantId, evaluation.evaluationId)).toThrow('finished evaluation')
      expect(changed.variants).toHaveLength(1)
      // Finishing one evaluation does not lock the entire working Variant.
      expect(addVariantFromVariant(changed, variant.variantId).variants).toHaveLength(2)
    } else {
      const child = addVariantFromEvaluation(changed, variant.variantId, evaluation.evaluationId).variants[1]
      expect(child.evaluationBranchPurpose).toBe(purpose)
      expect(child.note).toBe(verdict === 'continue' ? input.nextAction : '')
      expect(child.origin).toMatchObject({ evaluationId: evaluation.evaluationId, observation: input.observation, nextAction: input.nextAction, verdict, branchPurpose: purpose })
      expect(child.snapshot).toEqual(evaluation.snapshot)
    }
  })

  it('keeps linked Branch purpose and prior actions when the evaluation is finished and reopened', () => {
    const original = setup(), variant = original.variants[0], evaluation = variant.evaluations![0]
    const held = updateVariantEvaluation(original, variant.variantId, evaluation.evaluationId, { ...input, verdict: 'hold' })
    const branched = addVariantFromEvaluation(held, variant.variantId, evaluation.evaluationId)
    const finished = updateVariantEvaluation(branched, variant.variantId, evaluation.evaluationId, { ...input, verdict: 'stop', decisionNote: '  Not the intended direction  ' })
    expect(finished.variants[1]).toEqual(branched.variants[1])
    expect(finished.variants[1].evaluationBranchPurpose).toBe('check')
    expect(finished.variants[1].origin?.observation).toBe(input.observation)
    expect(finished.variants[0].evaluations![0]).toMatchObject({ decisionNote: 'Not the intended direction', nextAction: input.nextAction, snapshot: evaluation.snapshot })
    expect(() => validateExperiment(finished)).not.toThrow()
    expect(() => removeVariantEvaluation(finished, variant.variantId, evaluation.evaluationId)).toThrow('Branch')
    const reopened = updateVariantEvaluation(finished, variant.variantId, evaluation.evaluationId, { ...input, verdict: 'continue', decisionNote: 'Not the intended direction' })
    expect(addVariantFromEvaluation(reopened, variant.variantId, evaluation.evaluationId).variants[2].evaluationBranchPurpose).toBe('development')
    const parsed = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 3, data: { settings: {}, formulas: [formula], archive: [], meta: {}, experiments: [finished] } }))
    expect(parsed.data.experiments![0]).toEqual(finished)
  })

  it('accepts legacy evaluation Branches without purpose even if the evaluation is finished', () => {
    const original = setup(), variant = original.variants[0]
    const branched = addVariantFromEvaluation(original, variant.variantId, variant.evaluations![0].evaluationId)
    delete branched.variants[1].evaluationBranchPurpose
    delete branched.variants[1].origin
    branched.variants[0].evaluations![0].verdict = 'stop'
    expect(() => validateExperiment(branched)).not.toThrow()
  })

  it('rejects malformed decision notes and Branch purposes', () => {
    const original = setup(), variant = original.variants[0]
    const invalidNote = structuredClone(original)
    Object.assign(invalidNote.variants[0].evaluations![0], { decisionNote: 42 })
    expect(() => validateExperiment(invalidNote)).toThrow('Invalid evaluation')
    const invalidPurpose = addVariantFromEvaluation(original, variant.variantId, variant.evaluations![0].evaluationId)
    Object.assign(invalidPurpose.variants[1], { evaluationBranchPurpose: 'unknown' })
    expect(() => validateExperiment(invalidPurpose)).toThrow('Invalid evaluation Branch purpose')
    Object.assign(invalidPurpose.variants[1], { evaluationBranchPurpose: 'check', sourceEvaluationId: undefined })
    expect(() => validateExperiment(invalidPurpose)).toThrow('Invalid evaluation Branch purpose')
    const invalidOrigin = addVariantFromEvaluation(original, variant.variantId, variant.evaluations![0].evaluationId)
    invalidOrigin.variants[1].origin!.observation = ''
    expect(() => validateExperiment(invalidOrigin)).toThrow('Invalid Variant origin')
  })

  it('preserves the evaluated composition through later edits and isolates branches', () => {
    const original = setup(), variant = original.variants[0], evaluation = variant.evaluations![0]
    const edited = updateVariantRow(original, variant.variantId, 'r', { parts: 500, dilution: { enabled: true, percent: 1, solvent: 'ALC' } })
    const branched = addVariantFromEvaluation(edited, variant.variantId, evaluation.evaluationId)
    const branch = branched.variants[1]
    expect(branch.snapshot.rows[0].parts).toBe(1000)
    expect(branch.snapshot.rows[0].dilution?.percent).toBe(10)
    expect(branch.note).toBe(input.nextAction)
    expect(branch.sourceEvaluationId).toBe(evaluation.evaluationId)
    expect(branch.parentVariantId).toBe(variant.variantId)
    expect(branch.evaluations).toBeUndefined()
    branch.snapshot.rows[0].dilution!.percent = 20
    expect(branched.variants[0].evaluations![0].snapshot.rows[0].dilution?.percent).toBe(10)
    expect(original.variants).toHaveLength(1)
    expect(original.variants[0].snapshot.rows[0].parts).toBe(1000)
    expect(edited.variants[0].snapshot.rows[0].parts).toBe(500)
  })

  it('updates commentary without replacing snapshot or identity', () => {
    const original = setup(), variant = original.variants[0], evaluation = variant.evaluations![0]
    const changed = updateVariantRow(original, variant.variantId, 'r', { parts: 200 })
    const updated = updateVariantEvaluation(changed, variant.variantId, evaluation.evaluationId, { ...input, observation: 'Less convincing later', verdict: 'hold' })
    expect(updated.variants[0].evaluations![0]).toMatchObject({ evaluationId: evaluation.evaluationId, createdAt: evaluation.createdAt, snapshot: evaluation.snapshot, verdict: 'hold' })
    expect(original.variants[0].evaluations![0].observation).toBe(input.observation)
  })

  it('protects source evaluations and respects existing branch depth', () => {
    const original = setup(), variant = original.variants[0], evaluation = variant.evaluations![0]
    expect(removeVariantEvaluation(original, variant.variantId, evaluation.evaluationId).variants[0].evaluations).toEqual([])
    const branched = addVariantFromEvaluation(original, variant.variantId, evaluation.evaluationId)
    expect(() => removeVariantEvaluation(branched, variant.variantId, evaluation.evaluationId)).toThrow('Branch')
    const childId = branched.variants[1].variantId
    const withChildEvaluation = addVariantEvaluation(branched, childId, input)
    const deeper = addVariantFromEvaluation(withChildEvaluation, childId, withChildEvaluation.variants[1].evaluations![0].evaluationId)
    expect(deeper.variants[2].parentVariantId).toBe(childId)
    expect(addVariantFromVariant(original, variant.variantId).variants[1].sourceEvaluationId).toBeUndefined()
  })

  it('round-trips evaluations and their branch sources through storage and v3 backup', async () => {
    const original = setup(), variant = original.variants[0]
    const branched = addVariantFromEvaluation(original, variant.variantId, variant.evaluations![0].evaluationId)
    const storage = await createStorage()
    await storage.formulas.save(formula)
    await storage.experiments.save(branched)
    const loaded = await storage.experiments.get(branched.experimentId)
    loaded!.variants[0].evaluations![0].snapshot.rows[0].parts = 1
    expect((await storage.experiments.get(branched.experimentId))?.variants[0].evaluations![0].snapshot.rows[0].parts).toBe(1000)
    const backup = await createBackup(storage)
    const target = await createStorage()
    await importBackup(target, parseBackup(JSON.stringify(backup)))
    expect(await target.experiments.get(branched.experimentId)).toEqual(branched)
  })

  it('continues to accept experiments without evaluation fields', () => {
    const legacy = addVariantFromBase(createExperimentFromCurrent(formula))
    expect(() => validateExperiment(legacy)).not.toThrow()
    const parsed = parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 3, data: { settings: {}, formulas: [formula], archive: [], meta: {}, experiments: [legacy] } }))
    expect(parsed.data.experiments).toEqual([legacy])
  })

  it.each(['duplicate-id', 'bad-verdict', 'bad-date', 'bad-parts', 'bad-dilution', 'missing-source'] as const)('rejects corrupt backup evaluation data: %s', fault => {
    const experiment = setup(), evaluation = experiment.variants[0].evaluations![0]
    if (fault === 'duplicate-id') experiment.variants[0].evaluations!.push(structuredClone(evaluation))
    if (fault === 'bad-verdict') Object.assign(evaluation, { verdict: 'perfect' })
    if (fault === 'bad-date') evaluation.createdAt = 'invalid'
    if (fault === 'bad-parts') evaluation.snapshot.rows[0].parts = -1
    if (fault === 'bad-dilution') evaluation.snapshot.rows[0].dilution!.percent = 200
    if (fault === 'missing-source') experiment.variants[0].sourceEvaluationId = 'missing'
    expect(() => parseBackup(JSON.stringify({ app: 'Accordbook', formatVersion: 3, data: { settings: {}, formulas: [formula], archive: [], meta: {}, experiments: [experiment] } }))).toThrow('Invalid Experiment data')
  })

  it('requires an observation and validates snapshots before accepting an evaluation', () => {
    const experiment = setup(), variant = experiment.variants[0]
    expect(() => addVariantEvaluation(experiment, variant.variantId, { ...input, observation: ' ' })).toThrow()
    variant.snapshot.rows[0].parts = -1
    expect(() => addVariantEvaluation(experiment, variant.variantId, input)).toThrow()
  })
})
