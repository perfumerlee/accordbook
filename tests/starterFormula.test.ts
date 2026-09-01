import { describe, expect, it } from 'vitest'
import { starterFormulas } from '../src/data/starterFormulas'

describe('starter formulas', () => {
  it('contains three complete 1,000-part templates', () => {
    expect(starterFormulas).toHaveLength(3)
    for (const starter of starterFormulas) {
      expect(starter.materials.reduce((total, material) => total + material.parts, 0)).toBe(1000)
    }
  })
})
