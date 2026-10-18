import { describe, expect, it } from 'vitest'
import { findSolventMatch, getSolventByCode, getSolventSuggestions, solventDefinitions } from '../src/services/solventDictionary'

describe('solvent dictionary definitions', () => {
  it('contains exactly the approved initial definitions', () => {
    expect(solventDefinitions).toEqual([
      { code: 'ALC', fullName: 'Ethanol', aliases: ['Ethyl Alcohol', 'EtOH'] },
      { code: 'DPG', fullName: 'Dipropylene Glycol', aliases: [] },
      { code: 'TEC', fullName: 'Triethyl Citrate', aliases: [] },
      { code: 'IPM', fullName: 'Isopropyl Myristate', aliases: [] },
      { code: 'DEP', fullName: 'Diethyl Phthalate', aliases: [] },
      { code: 'BB', fullName: 'Benzyl Benzoate', aliases: [] },
      { code: 'PG', fullName: 'Propylene Glycol', aliases: [] },
    ])
  })

  it('has unique canonical codes and approved lookup keys', () => {
    const codes = solventDefinitions.map(item => item.code.toUpperCase())
    const keys = solventDefinitions.flatMap(item => [item.code, item.fullName, ...item.aliases]
      .map(value => value.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase()))
    expect(new Set(codes).size).toBe(codes.length)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('does not define BA or a generic Alcohol alias', () => {
    expect(getSolventByCode('BA')).toBeUndefined()
    expect(solventDefinitions.flatMap(item => item.aliases).map(value => value.toLowerCase())).not.toContain('alcohol')
  })
})

describe('findSolventMatch', () => {
  it.each([
    ['ALC', 'exact', 'ALC'], ['DPG', 'exact', 'DPG'], [' dPg ', 'exact', 'DPG'],
    ['Ethanol', 'exact', 'ALC'], ['Ethyl Alcohol', 'alias', 'ALC'], ['EtOH', 'alias', 'ALC'],
    ['Dipropylene Glycol', 'exact', 'DPG'], ['Triethyl Citrate', 'exact', 'TEC'],
    ['Isopropyl Myristate', 'exact', 'IPM'], ['Diethyl Phthalate', 'exact', 'DEP'],
    ['Benzyl Benzoate', 'exact', 'BB'], ['Propylene Glycol', 'exact', 'PG'],
  ] as const)('%s matches as %s for %s', (input, status, code) => {
    expect(findSolventMatch(input)).toMatchObject({ status, originalInput: input, canonicalCode: code })
  })

  it.each(['Alcohol', 'BA', 'Isopropyl Alcohol', 'Denatured Alcohol', 'Benzyl Alcohol', 'Benzyl Acetate', 'Custom Solvent'])('%s remains custom', input => {
    expect(findSolventMatch(input)).toEqual({ status: 'custom', originalInput: input })
  })

  it('returns empty for blank input and preserves the original input verbatim', () => {
    expect(findSolventMatch(' \t ')).toEqual({ status: 'empty', originalInput: ' \t ' })
    const input = '  eThYl   alcohol  '
    expect(findSolventMatch(input)).toMatchObject({ status: 'alias', originalInput: input, canonicalCode: 'ALC' })
  })

  it('normalizes Unicode for lookup without mutating caller-owned input', () => {
    const input = '  Ethyl\u00a0Alcohol '
    const before = input.slice()
    expect(findSolventMatch(input)).toMatchObject({ status: 'alias', originalInput: input, canonicalCode: 'ALC' })
    expect(input).toBe(before)
  })
})

describe('solvent suggestions', () => {
  it.each([
    ['Dipropylene', 'DPG'], ['Ethyl Alcohol', 'ALC'], ['d', 'DPG'], ['alc', 'ALC'],
    ['Alcohol', 'ALC'],
  ])('%s suggests %s without confirming a match', (query, code) => {
    expect(getSolventSuggestions(query).map(item => item.code)).toContain(code)
    if (query === 'Alcohol') expect(findSolventMatch(query)).toMatchObject({ status: 'custom' })
  })

  it('returns deterministic, deduplicated approved definitions', () => {
    const first = getSolventSuggestions('e')
    const second = getSolventSuggestions('e')
    expect(first).toEqual(second)
    expect(new Set(first.map(item => item.code)).size).toBe(first.length)
    expect(first.every(item => solventDefinitions.includes(item))).toBe(true)
    expect(getSolventSuggestions('')).toEqual([])
  })
})

describe('getSolventByCode', () => {
  it('matches canonical codes only and safely returns undefined for unknown codes', () => {
    expect(getSolventByCode(' alc ')?.fullName).toBe('Ethanol')
    expect(getSolventByCode('Ethanol')).toBeUndefined()
    expect(getSolventByCode('UNKNOWN')).toBeUndefined()
  })
})
