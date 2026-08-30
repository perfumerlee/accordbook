import { describe, expect, it } from 'vitest'
import { formulaFileName, parseFormulaFile } from '../src/services/formulaFile'

const valid = JSON.stringify({ type: 'accordbook-formula', formatVersion: 1, exportedAt: '2026-08-29T00:00:00.000Z', formula: { name: 'Jasmine Accord', notes: 'Keep cool', rows: [{ parts: 100, material: 'Jasmine', cas: '8022-96-6', marked: true, dilution: { enabled: true, percent: 10, solvent: 'ALC' } }] } })

describe('Formula File format', () => {
  it('parses shareable formula content without local identity', () => {
    const file = parseFormulaFile(valid)
    expect(file.formula.name).toBe('Jasmine Accord')
    expect(file.formula.rows[0]).toMatchObject({ parts: 100, material: 'Jasmine', cas: '8022-96-6', marked: true })
    expect(file.formula.rows[0].dilution).toEqual({ enabled: true, percent: 10, solvent: 'ALC' })
    expect(file.formula.rows[0]).not.toHaveProperty('id')
    expect(file.formatVersion).toBe(2)
  })

  it('uses the official extension while preserving the sanitized filename', () => {
    expect(formulaFileName('Jasmine Accord')).toBe('accordbook-jasmine-accord.accordbook')
    expect(formulaFileName('')).toBe('accordbook-formula.accordbook')
  })

  it.each([
    ['invalid JSON', '{'],
    ['wrong type', valid.replace('accordbook-formula', 'not-a-formula')],
  ])('rejects invalid Formula File contents regardless of filename', (_name, input) => {
    expect(() => parseFormulaFile(input)).toThrow()
  })

  it.each([
    ['backup', JSON.stringify({ app: 'Accordbook', formatVersion: 1, data: {} })],
    ['malformed', '{'],
    ['unsupported version', valid.replace('"formatVersion":1', '"formatVersion":2')],
    ['missing rows', valid.replace('"rows":[', '"rowsMissing":[')],
  ])('rejects %s without producing a Formula', (_name, input) => {
    expect(() => parseFormulaFile(input)).toThrow()
  })

  it('accepts future unknown top-level metadata as inert data', () => {
    const future = valid.replace('"exportedAt"', '"futureMetadata":{"source":"sample"},"exportedAt"')
    expect(parseFormulaFile(future).formula.name).toBe('Jasmine Accord')
  })
})
