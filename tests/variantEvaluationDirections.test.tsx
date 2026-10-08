import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import VariantEvaluations from '../src/components/VariantEvaluations'
import type { EvaluationVerdict, Experiment } from '../src/models/experiment'

const experiment = (verdict: EvaluationVerdict): Experiment => ({
  experimentId: 'e', parentFormulaId: 'f', name: 'Study', createdAt: '', updatedAt: '',
  baseSource: { kind: 'current', sourceCurrentUpdatedAt: '' },
  baseSnapshot: { name: '', date: '', notes: '', formulaId: 'F', rows: [] }, nextVariantOrdinal: 1,
  variants: [{ variantId: 'v', parentVariantId: null, label: 'A', createdAt: '', updatedAt: '', note: '', snapshot: { rows: [] }, evaluations: [{ evaluationId: 'n', createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z', snapshot: { rows: [] }, observation: 'Observation', nextAction: 'Action', verdict }] }],
})
const render = (verdict: EvaluationVerdict, language: 'en' | 'ko', draft = false) => {
  const value = experiment(verdict)
  return renderToStaticMarkup(<VariantEvaluations experiment={value} variant={value.variants[0]} language={language} disabled={false} onChange={() => {}} drafts={draft ? { 'e:v': { observation: 'Observation', nextAction: 'Action', verdict } } : {}} onDraftsChange={() => {}}/>)
}

describe('evaluation direction presentation', () => {
  it.each([
    ['continue', 'Create next Branch from this composition', 'What to try next', '이 배합에서 다음 브랜치 만들기'],
    ['hold', 'Create a check Branch', 'What to check', '확인용 브랜치 만들기'],
    ['uncertain', 'Create a comparison Branch', 'What is needed to decide?', '비교용 브랜치 만들기'],
  ] as const)('labels the %s action and its purpose in both languages', (verdict, action, field, koreanAction) => {
    expect(render(verdict, 'en')).toContain(action)
    expect(render(verdict, 'en', true)).toContain(field)
    expect(render(verdict, 'ko')).toContain(koreanAction)
  })
  it('shows no Branch creation action for finished evaluations', () => {
    const html = render('stop', 'en')
    expect(html).not.toContain('Create next Branch')
    expect(html).not.toContain('Create a check Branch')
    expect(html).not.toContain('Create a comparison Branch')
    expect(html).toContain('Edit evaluation')
    expect(html).toContain('Previously planned action')
    expect(render('stop', 'en', true)).toContain('Why finish this direction?')
    expect(render('stop', 'ko')).toContain('여기서 종료')
  })
  it('places AI Next Round before record management and keeps Branch creation on the opposite side', () => {
    const html = render('continue', 'en')
    const aiAction = html.indexOf('experiment-next-round__trigger')
    const editAction = html.indexOf('Edit evaluation')
    const deleteAction = html.indexOf('Delete evaluation')
    const branchAction = html.indexOf('Create next Branch from this composition')
    expect(aiAction).toBeGreaterThan(-1)
    expect(aiAction).toBeLessThan(editAction)
    expect(editAction).toBeLessThan(deleteAction)
    expect(deleteAction).toBeLessThan(branchAction)
    expect(html).toContain('class="evaluation-actions"')
  })
  it('keeps record actions and Branch creation in a stable two-column footer while the AI panel expands above', () => {
    const css = readFileSync('src/components/variantEvaluations.css', 'utf8')
    expect(css).toContain('.evaluation-actions { display: grid; grid-template-columns:minmax(0,1fr) auto;')
    expect(css).toContain('.evaluation-create-branch { justify-self:end; white-space:nowrap; }')
    expect(css).toContain('@media (max-width: 760px)')
  })
})
