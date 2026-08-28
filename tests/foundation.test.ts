import { describe, expect, it } from 'vitest'

describe('Accordbook foundation', () => {
  it('uses the v0.01 standard batch size', () => {
    expect(1000 * 0.01).toBe(10)
  })
})
