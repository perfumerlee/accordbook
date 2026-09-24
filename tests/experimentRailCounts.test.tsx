import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ExperimentGenealogyRail from '../src/components/ExperimentGenealogyRail'
import { buildExperimentRail } from '../src/services/experimentRail'
import type { Experiment } from '../src/models/experiment'

const nodes: Array<[string, string | null]> = [['A', null], ['A1', 'A'], ['A2', 'A'], ['A2.1', 'A2'], ['A2.1.1', 'A2.1'], ['A2.1.1.1', 'A2.1.1'], ['A2.1.1.2', 'A2.1.1']]
const experiment: Experiment = {
  experimentId: 'e', parentFormulaId: 'f', name: 'Counts', createdAt: '', updatedAt: '', nextVariantOrdinal: 2,
  baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' },
  baseSnapshot: { name: '', date: '', notes: '', formulaId: 'ACC', rows: [] },
  variants: nodes.map(([variantId, parentVariantId]) => ({ variantId, parentVariantId, label: variantId, createdAt: '', updatedAt: '', note: '', snapshot: { rows: [] } })),
}
const render = (value = experiment, mode: 'navigation' | 'compare' = 'navigation', language: 'en' | 'ko' = 'en') => renderToStaticMarkup(
  <ExperimentGenealogyRail model={buildExperimentRail(value)} editingState="base" activeFamilyId={null} mode={mode} language={language} onSelectBase={() => {}} onSelectVariant={() => {}} />,
)

describe('First-level Branch descendant badges', () => {
  it('shows all four descendants with Deep branches collapsed, but no badge for a leaf', () => {
    const html = render()
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/>A2<span class="rail-count"[^>]*>4<\/span>/)
    expect(html).toContain('>A1</button>')
    expect(html).toContain('4 descendant Branches total · all levels included')
    expect(html).toMatch(/>A<span class="rail-count"[^>]*>2<\/span>/)
  })
  it('updates when a deep leaf is removed', () => {
    const html = render({ ...experiment, variants: experiment.variants.filter(v => v.variantId !== 'A2.1.1.2') })
    expect(html).toMatch(/>A2<span class="rail-count"[^>]*>3<\/span>/)
  })
  it('preserves counts in comparison mode and explains all levels in Korean', () => {
    const html = render(experiment, 'compare', 'ko')
    expect(html).toMatch(/>A2<span class="rail-count"[^>]*>4<\/span>/)
    expect(html).toContain('하위 브랜치 총 4개 · 모든 단계 포함')
  })
})
