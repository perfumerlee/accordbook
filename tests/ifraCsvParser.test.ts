import { describe, expect, it } from 'vitest'
import { parseIfraCsv } from '../src/services/ifraCsvParser'

describe('parseIfraCsv', () => {
  it('parses category columns and reserved allergen columns', () => {
    const csv = 'cas,name,cat4,cat5A,allergen_26,allergen_83\n' +
      '106-24-1,Geraniol,5.4,1.2,TRUE,TRUE\n'
    const { dataset, skippedRows } = parseIfraCsv(csv)
    expect(skippedRows).toBe(0)
    expect(dataset.categoryKeys).toEqual(['cat4', 'cat5A'])
    expect(dataset.materials).toHaveLength(1)
    const [material] = dataset.materials
    expect(material.cas).toBe('106-24-1')
    expect(material.name).toBe('Geraniol')
    expect(material.limits).toEqual({ cat4: 5.4, cat5A: 1.2 })
    expect(material.allergen26).toBe(true)
    expect(material.allergen83).toBe(true)
  })

  it('handles quoted fields containing commas', () => {
    const csv = 'cas,name,cat4\n"106-24-1","Geraniol, natural",5.4\n'
    const { dataset } = parseIfraCsv(csv)
    expect(dataset.materials[0].name).toBe('Geraniol, natural')
  })

  it('skips rows without a CAS number', () => {
    const csv = 'cas,name,cat4\n,No CAS,5.4\n106-24-1,Geraniol,5.4\n'
    const { dataset, skippedRows } = parseIfraCsv(csv)
    expect(skippedRows).toBe(1)
    expect(dataset.materials).toHaveLength(1)
  })

  it('treats blank/non-numeric limit cells as no data', () => {
    const csv = 'cas,name,cat4,cat5A\n106-24-1,Geraniol,,n/a\n'
    const { dataset } = parseIfraCsv(csv)
    expect(dataset.materials[0].limits).toEqual({})
  })

  it('parses allergen_26 and allergen_83 independently', () => {
    const csv = 'cas,name,cat4,allergen_26,allergen_83\n106-24-1,Geraniol,5.4,TRUE,FALSE\n78-70-6,Linalool,10.0,FALSE,TRUE\n'
    const { dataset } = parseIfraCsv(csv)
    expect(dataset.materials[0].allergen26).toBe(true)
    expect(dataset.materials[0].allergen83).toBe(false)
    expect(dataset.materials[1].allergen26).toBe(false)
    expect(dataset.materials[1].allergen83).toBe(true)
  })

  it('works without the allergen columns present', () => {
    const csv = 'cas,name,cat4\n106-24-1,Geraniol,5.4\n'
    const { dataset } = parseIfraCsv(csv)
    expect(dataset.materials[0].allergen26).toBeUndefined()
    expect(dataset.materials[0].allergen83).toBeUndefined()
  })
})
