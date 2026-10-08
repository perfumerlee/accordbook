import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Experiment } from '../src/models/experiment'
import ExperimentComparePanel from '../src/components/ExperimentComparePanel'
import ExperimentComparisonSheet from '../src/components/ExperimentComparisonSheet'

const experiment: Experiment = {
  experimentId: 'local-experiment-id', parentFormulaId: 'local-formula-id', name: 'PRIVATE EXPERIMENT TITLE',
  createdAt: '', updatedAt: 'revision-1', nextVariantOrdinal: 2,
  baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' },
  baseSnapshot: { name: 'PRIVATE FORMULA NAME', date: '', notes: 'PRIVATE FORMULA NOTES', formulaId: 'ACC', rows: [{ rowId: 'base-row', material: 'Hedione', cas: '24851-98-7', parts: 1000, memo: 'PRIVATE BASE MEMO' }] },
  variants: [{ variantId: 'local-variant-id', parentVariantId: null, label: 'A', createdAt: '', updatedAt: '', note: 'PRIVATE VARIANT NOTE', snapshot: { rows: [{ rowId: 'variant-row', material: 'Hedione', cas: '24851-98-7', parts: 1000, memo: 'PRIVATE VARIANT MEMO' }] } }],
}

describe('Experiment Compare panel entry', () => {
  it('renders a closed localized entry point and does not open consent or submit on mount', () => {
    const html = renderToStaticMarkup(<ExperimentComparePanel experiment={experiment} variantIds={['local-variant-id']} language="en" />)
    expect(html).toContain('AI Compare')
    expect(html).toContain('class="ai-action-icon"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Beta access token')
    expect(html).not.toContain('I understand and consent')
    expect(html).not.toContain('PRIVATE FORMULA NAME')
    expect(html).not.toContain('PRIVATE VARIANT NOTE')
  })

  it('provides the Korean entry label without exposing local identifiers', () => {
    const html = renderToStaticMarkup(<ExperimentComparePanel experiment={experiment} variantIds={['local-variant-id']} language="ko" />)
    expect(html).toContain('AI Compare')
    expect(html.match(/class="ai-action-icon"/g)).toHaveLength(1)
    expect(html).not.toContain('✦')
    expect(html).not.toContain('local-experiment-id')
    expect(html).not.toContain('local-variant-id')
  })

  it('mounts the AI Compare entry inside the existing comparison sheet beside BASE and selected Variant columns', () => {
    const html = renderToStaticMarkup(<ExperimentComparisonSheet experiment={experiment} formula={{ formulaId: 'ACC-1', name: 'Formula' }} language="en" variantIds={['local-variant-id']} onClose={() => {}} />)
    expect(html).toContain('BASE')
    expect(html).toContain('A')
    expect(html).toContain('AI Compare')
    expect(html).toContain('aria-expanded="false"')
  })

  it('connects the expanded Review History button to its content panel as a tab', () => {
    const css = readFileSync('src/components/experimentComparePanel.css', 'utf8')
    expect(css).toContain('.experiment-ai-compare__history-toggle:has(button[aria-expanded="true"])')
    expect(css).toContain('border-bottom-color: var(--paper-2)')
    expect(css).toContain('border-radius: 0 8px 8px 8px')
    expect(css).toContain('.experiment-ai-compare__history {\n  margin-top: 0;')
  })
})
