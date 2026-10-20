import { describe, expect, it } from 'vitest'
import { recognizeFormulaPasteDilution, validateFormulaPasteDilutionReview } from '../src/services/formulaPasteDilution'
import { detectFormulaPasteColumns, parseFormulaPaste, validateFormulaPaste } from '../src/services/formulaPasteImport'

describe('Formula paste dilution recognition', () => {
  it.each([
    ['Ambroxan 10%', 'Ambroxan', 10, undefined],
    ['Ambroxan (10%)', 'Ambroxan', 10, undefined],
    ['Ambroxan 10 %', 'Ambroxan', 10, undefined],
    ['Ethyl Maltol 1%', 'Ethyl Maltol', 1, undefined],
    ['Iso E Super (50%)', 'Iso E Super', 50, undefined],
    ['Ambroxan 0.1%', 'Ambroxan', 0.1, undefined],
    ['Ambroxan 100%', 'Ambroxan', 100, undefined],
    ['Ambroxan 10% in DPG', 'Ambroxan', 10, 'DPG'],
    ['Ambroxan (10% in DPG)', 'Ambroxan', 10, 'DPG'],
    ['Ambroxan 10% in Dipropylene Glycol', 'Ambroxan', 10, 'Dipropylene Glycol'],
    ['Ambroxan 10% DPG', 'Ambroxan', 10, 'DPG'],
    ['Galaxolide 50% IPM', 'Galaxolide', 50, 'IPM'],
    ['Coumarin @10% in ALC', 'Coumarin', 10, 'ALC'],
    ['Coumarin @1% in DPG', 'Coumarin', 1, 'DPG'],
    ['Coumarin @0.1% in ALC', 'Coumarin', 0.1, 'ALC'],
    ['Coumarin @10%', 'Coumarin', 10, undefined],
    ['Coumarin (@10% in ALC)', 'Coumarin', 10, 'ALC'],
  ])('proposes supported suffix %s without approving it', (source, proposedMaterial, proposedPercent, proposedSolvent) => {
    expect(recognizeFormulaPasteDilution(source)).toEqual({
      status: 'proposed', originalMaterial: source, proposedMaterial, proposedPercent,
      ...(proposedSolvent ? { proposedSolvent } : {}),
    })
  })

  it('leaves ordinary names and percentages inside longer names untouched', () => {
    expect(recognizeFormulaPasteDilution('Hedione')).toEqual({ status: 'none', originalMaterial: 'Hedione' })
    expect(recognizeFormulaPasteDilution('No. 10% Amber Accord')).toEqual({ status: 'ambiguous', originalMaterial: 'No. 10% Amber Accord', issueCode: 'DILUTION_AMBIGUOUS_NOTATION' })
  })

  it.each([
    'Ambroxan 10% Solution', 'Ambroxan 10% / 20%',
    'Coumarin @@10% in ALC', 'Coumarin @10%% in ALC', 'Coumarin @10% / ALC',
    'Ambroxan 10 percent', 'Ambroxan 10％', 'Ambroxan 10% Accord',
  ])('preserves ambiguous source name %s', source => {
    expect(recognizeFormulaPasteDilution(source)).toEqual({ status: 'ambiguous', originalMaterial: source, issueCode: 'DILUTION_AMBIGUOUS_NOTATION' })
  })

  it.each([
    ['Material 150%', 'DILUTION_INVALID_PERCENT'], ['Material -10%', 'DILUTION_INVALID_PERCENT'],
    ['Material NaN%', 'DILUTION_INVALID_PERCENT'], ['Material Infinity%', 'DILUTION_INVALID_PERCENT'],
    ['Material %', 'DILUTION_INVALID_PERCENT'], ['10%', 'DILUTION_MATERIAL_REQUIRED'],
    ['Material 1e309%', 'DILUTION_INVALID_PERCENT'], ['Material 999999999999999999999999999999999999999999%', 'DILUTION_INVALID_PERCENT'],
  ] as const)('rejects invalid notation %s without clamping', (source, issueCode) => {
    expect(recognizeFormulaPasteDilution(source)).toEqual({ status: 'invalid', originalMaterial: source, issueCode })
  })

  it('requires an explicit user decision and solvent before applying a proposal', () => {
    const proposal = recognizeFormulaPasteDilution('Ambroxan 10%')
    expect(validateFormulaPasteDilutionReview(proposal)).toMatchObject({ status: 'pending', material: 'Ambroxan 10%' })
    expect(validateFormulaPasteDilutionReview(proposal, { action: 'apply', percent: 10, solvent: '' })).toMatchObject({ status: 'invalid', issueCode: 'DILUTION_SOLVENT_REQUIRED' })
    expect(validateFormulaPasteDilutionReview(proposal, { action: 'apply', percent: 101, solvent: 'DPG' })).toMatchObject({ status: 'invalid', issueCode: 'DILUTION_INVALID_PERCENT' })
    expect(validateFormulaPasteDilutionReview(proposal, { action: 'apply', percent: 10, solvent: 'DPG', material: '  ' })).toMatchObject({ status: 'invalid', issueCode: 'DILUTION_MATERIAL_REQUIRED' })
    expect(validateFormulaPasteDilutionReview(proposal, { action: 'apply', percent: 10, solvent: ' DPG ' })).toEqual({ status: 'approved', material: 'Ambroxan', dilution: { enabled: true, percent: 10, solvent: 'DPG' } })
  })

  it('allows explicit Keep Original even when solvent is missing or notation is ambiguous', () => {
    expect(validateFormulaPasteDilutionReview(recognizeFormulaPasteDilution('Ambroxan 10%'), { action: 'keep' })).toEqual({ status: 'kept', material: 'Ambroxan 10%' })
    expect(validateFormulaPasteDilutionReview(recognizeFormulaPasteDilution('Ambroxan 10% DPG'), { action: 'keep' })).toEqual({ status: 'kept', material: 'Ambroxan 10% DPG' })
  })

  it('integrates inert proposals into candidates without changing values, readiness, row order, or Parts', () => {
    const parsed = parseFormulaPaste('Material\tParts\nAmbroxan 10%\t100\nHedione\t900\nAmbroxan 10%\t0')
    const mapping = detectFormulaPasteColumns(parsed).mapping!
    const before = structuredClone(parsed)
    const result = validateFormulaPaste(parsed, mapping)
    expect(result.readyForApproval).toBe(true)
    expect(result.rows.map(row => [row.sourceRowNumber, row.originalMaterial, row.material, row.parts])).toEqual([
      [2, 'Ambroxan 10%', 'Ambroxan 10%', 100], [3, 'Hedione', 'Hedione', 900], [4, 'Ambroxan 10%', 'Ambroxan 10%', 0],
    ])
    expect(result.totalParts).toBe(1000)
    expect(result.rows.map(row => row.dilutionRecognition.status)).toEqual(['proposed', 'none', 'proposed'])
    expect(result.rows[0].dilutionRecognition).toMatchObject({ proposedMaterial: 'Ambroxan', proposedPercent: 10 })
    expect(result.rows[2].dilutionRecognition).toMatchObject({ proposedMaterial: 'Ambroxan', proposedPercent: 10 })
    expect(parsed).toEqual(before)
  })
})
