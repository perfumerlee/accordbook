import { describe, expect, it } from 'vitest'
import { guideContextHref } from '../src/components/ContextGuideLinks'

describe('Guide context links', () => {
  it('keeps locale and chapter identity', () => {
    expect(guideContextHref('en', 'time-machine')).toBe('/guide/en/time-machine/')
    expect(guideContextHref('ko', 'experiments')).toBe('/guide/ko/experiments/')
    expect(guideContextHref('ko', 'import-export')).toBe('/guide/ko/import-export/')
  })
})
