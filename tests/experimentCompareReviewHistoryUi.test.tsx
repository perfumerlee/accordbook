import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import ExperimentCompareReviewHistory from '../src/components/ExperimentCompareReviewHistory'
import type { AiReviewRepository } from '../src/storage/aiReviewRepository'

describe('Experiment Review History access UI', () => {
  it('provides a global history view and return path without any AI compare controls', () => {
    const html = renderToStaticMarkup(<ExperimentCompareReviewHistory reviews={{} as AiReviewRepository} language="en" getExperiment={async () => undefined} onBack={() => {}} onNavigate={async () => true} />)
    expect(html).toContain('Experiment AI Review History')
    expect(html).toContain('Back to Experiments')
    expect(html).not.toContain('Beta access token')
    expect(html).not.toContain('Run AI comparison')
  })

  it('keeps the Next Round operation label in English in Korean history', () => {
    const component = readFileSync('src/components/ExperimentCompareReviewHistory.tsx', 'utf8')
    expect(component).toContain("compare: 'AI Compare', nextRound: 'AI Next Round'")
    expect(component).not.toContain("ko ? '다음 라운드'")
  })

  it('identifies operation and source target while keeping review actions readable on narrow screens', () => {
    const component = readFileSync('src/components/ExperimentCompareReviewHistory.tsx', 'utf8')
    const css = readFileSync('src/components/experimentReviewHistory.css', 'utf8')
    expect(css).toContain('@media(max-width:767px)')
    expect(css).toContain('grid-template-columns:minmax(0,1fr) auto')
    expect(css).toContain('.experiment-review-history__actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; }')
    expect(css).toContain('grid-template-columns:repeat(2,minmax(0,1fr))')
    expect(css).toContain('white-space:nowrap')
    expect(css).toContain('overflow-wrap:anywhere')
    expect(component).toContain("baseVersion: ko ? 'BASE 버전' : 'BASE version'")
    expect(component).toContain('parentVariantId')
    expect(component).toContain('evaluation.createdAt')
    expect(component).toContain('experiment-review-history__target')
  })

  it('lets the experiment modal history content scroll instead of clipping longer review lists', () => {
    const css = readFileSync('src/components/experimentModalShell.css', 'utf8')
    expect(css).toContain('.experiment-entry-content { flex:1 1 auto; min-height:0; overflow-x:hidden; overflow-y:auto;')
    expect(css).toContain('overscroll-behavior:contain')
  })
})
