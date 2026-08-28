import { describe, expect, it } from 'vitest'
import { isSolventMaterial } from '../src/services/solventClassifier'

describe('solvent classifier', () => {
  it.each(['ALC', 'dpg', ' IPM ', 'tec'])('%s is a solvent', (name) => {
    expect(isSolventMaterial(name)).toBe(true)
  })

  it('does not classify arbitrary materials as solvents', () => {
    expect(isSolventMaterial('Linalool')).toBe(false)
  })
})
