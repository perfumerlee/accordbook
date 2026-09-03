import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAnalyticsForTests, trackEvent, trackFormulaCompleted, trackFormulaCreated } from '../src/services/analytics'

function setHost(hostname: string) {
  const browserWindow = globalThis.window as Window
  Object.defineProperty(browserWindow, 'location', { configurable: true, value: { hostname } })
}

describe('product analytics', () => {
  beforeEach(() => {
    resetAnalyticsForTests()
    vi.stubGlobal('window', { dataLayer: [] })
    setHost('accordbook.org')
  })

  it('pushes only the event and approved creation method on production', () => {
    trackFormulaCreated('new')
    trackFormulaCreated('duplicate')
    expect(window.dataLayer).toEqual([
      { event: 'formula_created', creation_method: 'new' },
      { event: 'formula_created', creation_method: 'duplicate' },
    ])
    expect(JSON.stringify(window.dataLayer)).not.toContain('material')
    expect(JSON.stringify(window.dataLayer)).not.toContain('notes')
  })

  it('is a no-op on localhost', () => {
    setHost('localhost')
    trackFormulaCreated('new')
    expect(window.dataLayer).toEqual([])
  })

  it('does not send custom events from the retired GitHub Pages host', () => {
    setHost('perfumerlee.github.io')
    trackFormulaCreated('new')
    expect(window.dataLayer).toEqual([])
  })

  it('deduplicates formula completion within the session', () => {
    trackFormulaCompleted('internal-1')
    trackFormulaCompleted('internal-1')
    expect(window.dataLayer).toEqual([{ event: 'formula_completed' }])
    expect(JSON.stringify(window.dataLayer)).not.toContain('internal-1')
  })

  it('does not let a failing dataLayer interrupt application code', () => {
    window.dataLayer = []
    Object.defineProperty(window.dataLayer, 'push', { value: () => { throw new Error('blocked') } })
    expect(() => trackEvent('backup_exported')).not.toThrow()
  })
})
