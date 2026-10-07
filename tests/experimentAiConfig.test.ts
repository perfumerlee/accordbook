import { describe, expect, it } from 'vitest'
import { resolveExperimentAiRequestLimit } from '../src/services/experimentAiConfig'

describe('verified Experiment AI request limit configuration', () => {
  it('accepts the verified production byte limit', () => {
    expect(resolveExperimentAiRequestLimit('16384')).toEqual({ bytes: 16384, verified: true })
  })

  it.each([undefined, '', ' 16384', '16kb', '0', '255', '16385', '999999999999999999999'])('fails closed for an absent or invalid limit (%s)', value => {
    expect(resolveExperimentAiRequestLimit(value)).toEqual({ verified: false })
  })
})
