import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import ExperimentCompareReviewHistory from '../src/components/ExperimentCompareReviewHistory'
import type { AiReviewRepository } from '../src/storage/aiReviewRepository'

describe('Experiment Review History access UI', () => {
  it('provides a global history view and return path without any AI compare controls', () => {
    const html = renderToStaticMarkup(<ExperimentCompareReviewHistory reviews={{} as AiReviewRepository} language="en" getExperiment={async () => undefined} onBack={() => {}} />)
    expect(html).toContain('Experiment AI Review History')
    expect(html).toContain('Back to Experiments')
    expect(html).not.toContain('Beta access token')
    expect(html).not.toContain('Run AI comparison')
  })

  it('stacks history controls and records on narrow viewports', () => {
    const css = readFileSync('src/components/experimentReviewHistory.css', 'utf8')
    expect(css).toContain('@media(max-width:767px)')
    expect(css).toContain('.experiment-review-history > ul > li { flex-direction:column; }')
    expect(css).toContain('.experiment-review-history > ul > li > div:last-child { display:grid; flex:0 0 88px;')
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))')
    expect(css).toContain('white-space:nowrap')
    expect(css).toContain('overflow-wrap:anywhere')
  })
})
