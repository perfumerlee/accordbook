import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Experiment } from '../src/models/experiment'
import ExperimentComparePanel, { compareReviewVersionText } from '../src/components/ExperimentComparePanel'
import ExperimentComparisonSheet from '../src/components/ExperimentComparisonSheet'

const experiment: Experiment = {
  experimentId: 'local-experiment-id', parentFormulaId: 'local-formula-id', name: 'PRIVATE EXPERIMENT TITLE',
  createdAt: '', updatedAt: 'revision-1', nextVariantOrdinal: 2,
  baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' },
  baseSnapshot: { name: 'PRIVATE FORMULA NAME', date: '', notes: 'PRIVATE FORMULA NOTES', formulaId: 'ACC', rows: [{ rowId: 'base-row', material: 'Hedione', cas: '24851-98-7', parts: 1000, memo: 'PRIVATE BASE MEMO' }] },
  variants: [{ variantId: 'local-variant-id', parentVariantId: null, label: 'A', createdAt: '', updatedAt: '', note: 'PRIVATE VARIANT NOTE', snapshot: { rows: [{ rowId: 'variant-row', material: 'Hedione', cas: '24851-98-7', parts: 1000, memo: 'PRIVATE VARIANT MEMO' }] } }],
}

describe('Experiment Compare panel entry', () => {
  it('identifies saved comparison scope from BASE to the selected variant labels', () => {
    expect(compareReviewVersionText(['A'])).toBe('BASE ↔ A')
    expect(compareReviewVersionText(['A', 'B'])).toBe('BASE ↔ A, B')
    const source = readFileSync('src/components/ExperimentComparePanel.tsx', 'utf8')
    expect(source).toContain('Compared versions')
    expect(source).toContain('비교 버전')
    expect(source).not.toContain('<h3>{t.history}</h3>')
  })

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

  it('provides sibling setup and Review History tabs with an early count', () => {
    const component = readFileSync('src/components/ExperimentComparePanel.tsx', 'utf8')
    const css = readFileSync('src/components/experimentComparePanel.css', 'utf8')
    expect(component).toContain('className="experiment-ai-compare__view-switch" role="group"')
    expect(component).toContain("historyLoaded ? historyError ? '—' : historyItems.length : '…'")
    expect(css).toContain('.experiment-ai-compare__view-switch:has(button:last-child[aria-pressed="true"])')
    expect(css).toContain('.experiment-ai-compare__panel:has(.experiment-ai-compare__view-switch button:last-child[aria-pressed="true"]) > :not(header):not(.experiment-ai-compare__view-switch):not(.experiment-ai-compare__history)')
  })

  it('shows the source formula and branch lineage in saved Compare targets', () => {
    const component = readFileSync('src/components/ExperimentComparePanel.tsx', 'utf8')
    expect(component).toContain('BASE · ${source.baseSnapshot.formulaId} · ${source.baseSnapshot.date}')
    expect(component).toContain("path.join(' › ')")
    expect(component).toContain("language === 'ko' ? '브랜치' : 'Branch'")
  })
})
