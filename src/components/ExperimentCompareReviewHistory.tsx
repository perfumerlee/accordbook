import { useEffect, useState } from 'react'
import type { Experiment } from '../models/experiment'
import type { ExperimentAiReviewRecord } from '../models/aiReviewRecord'
import type { AiReviewRepository } from '../storage/aiReviewRepository'
import './experimentReviewHistory.css'

export default function ExperimentCompareReviewHistory({ reviews, language, getExperiment, onBack }: { reviews: AiReviewRepository; language: 'en' | 'ko'; getExperiment: (id: string) => Promise<Experiment | undefined>; onBack: () => void }) {
  const ko = language === 'ko'
  const [items, setItems] = useState<Array<{ record: ExperimentAiReviewRecord; experiment?: Experiment; orphan: boolean }>>([])
  const [selected, setSelected] = useState<ExperimentAiReviewRecord>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [generation, setGeneration] = useState(0)
  const t = { title: 'Experiment AI Review History', back: ko ? '실험 목록으로' : 'Back to Experiments', backToHistory: ko ? '리뷰 목록으로' : 'Back to Reviews', noItems: ko ? '저장된 실험 리뷰가 없습니다.' : 'No saved Experiment Reviews.', orphan: ko ? '원본 실험을 찾을 수 없습니다' : 'Source Experiment is no longer available', open: ko ? '리뷰 열기' : 'Open Review', remove: ko ? '리뷰 삭제' : 'Delete Review', confirm: ko ? '이 실험 리뷰를 삭제할까요? 삭제 후에는 복구할 수 없습니다.' : 'Delete this Experiment Review? This cannot be undone.', failed: ko ? '기록을 불러오거나 삭제하지 못했습니다.' : 'Could not load or verify the Review History change.', compare: 'AI Compare', nextRound: 'AI Next Round', baseVersion: ko ? 'BASE 버전' : 'BASE version', target: ko ? '대상' : 'Target', evaluation: ko ? '평가' : 'Evaluation', variant: ko ? '시안' : 'Variant', branch: ko ? '브랜치' : 'Branch' }
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    void (async () => { try { const records = await reviews.listAllExperimentReviews(); const next = await Promise.all(records.map(async record => { const experiment = await getExperiment(record.experimentId); return { record, experiment, orphan: !experiment } })); if (active) setItems(next) }
      catch { if (active) setError(t.failed) } finally { if (active) setLoading(false) } })()
    return () => { active = false }
  }, [reviews, getExperiment, generation])
  const remove = async (record: ExperimentAiReviewRecord) => {
    if (!window.confirm(t.confirm)) return
    setError('')
    try { const existing = await reviews.getExperimentReviewRecord(record.reviewId); if (!existing) throw new Error('Missing review'); await reviews.delete(record.reviewId); if (await reviews.get(record.reviewId)) throw new Error('Delete not verified'); setSelected(value => value?.reviewId === record.reviewId ? undefined : value); setGeneration(value => value + 1) }
    catch { setError(t.failed) }
  }
  const headline = (record: ExperimentAiReviewRecord) => record.operation === 'compare' ? record.response.summary : record.response.findings
  const variantPath = (experiment: Experiment | undefined, variantId: string) => {
    if (!experiment) return undefined
    const variant = experiment.variants.find(item => item.variantId === variantId)
    if (!variant) return undefined
    const path: string[] = []; let current = variant; let hasParent = false
    for (let depth = 0; current && depth < experiment.variants.length; depth++) { path.unshift(current.label); if (!current.parentVariantId) break; hasParent = true; const parent = experiment.variants.find(item => item.variantId === current.parentVariantId); if (!parent) break; current = parent }
    return { label: path.join(' › '), isBranch: hasParent }
  }
  const targetSummary = (record: ExperimentAiReviewRecord, experiment?: Experiment) => {
    const base = experiment ? `${experiment.baseSnapshot.formulaId} · ${experiment.baseSnapshot.date}` : 'BASE'
    if (record.operation === 'compare') {
      const variants = record.selectedVariantIds.map((id, index) => { const path = variantPath(experiment, id); const type = path?.isBranch ? t.branch : t.variant; return `${type} ${record.selectedVariantLabels[index] ?? path?.label ?? '—'}${path?.isBranch ? ` (${path.label})` : ''}` })
      return `${t.baseVersion}: ${base} ↔ ${variants.join(', ')}`
    }
    const path = variantPath(experiment, record.variantId); const type = path?.isBranch ? t.branch : t.variant
    const variant = experiment?.variants.find(item => item.variantId === record.variantId)
    const evaluation = variant?.evaluations?.find(item => item.evaluationId === record.evaluationId)
    const evaluationDate = evaluation ? new Date(evaluation.createdAt).toLocaleDateString(ko ? 'ko-KR' : 'en-US') : undefined
    return `${t.baseVersion}: ${base} → ${t.evaluation} · ${type} ${record.variantLabel}${path?.isBranch ? ` (${path.label})` : ''}${evaluationDate ? ` · ${evaluationDate}` : ''}`
  }
  const list = (values: readonly string[]) => values.length ? <ul>{values.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}</ul> : <p>—</p>
  return <section className="experiment-review-history ai-notebook" aria-label={t.title}>
    <header><div><p>{ko ? '저장 기록' : 'SAVED RECORDS'}</p><h2>{t.title}</h2></div><button type="button" onClick={onBack}>{t.back}</button></header>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">{ko ? '불러오는 중…' : 'Loading…'}</p>}
    {!loading && !error && !selected && !items.length && <p>{t.noItems}</p>}
    {!loading && !selected && items.length > 0 && <ul>{items.map(({ record, experiment, orphan }) => <li key={record.reviewId}><div className="experiment-review-history__copy"><strong>{record.experimentDisplayName || '—'}</strong><span className="experiment-review-history__operation">{record.operation === 'compare' ? t.compare : t.nextRound}</span><small>{new Date(record.createdAt).toLocaleString(ko ? 'ko-KR' : 'en-US')} · {record.locale.toUpperCase()}</small><span className="experiment-review-history__target">{targetSummary(record, experiment)}</span><p>{headline(record)}</p>{orphan && <span>{t.orphan}</span>}</div><div className="experiment-review-history__actions"><button type="button" onClick={() => setSelected(record)}>{t.open}</button><button type="button" onClick={() => void remove(record)}>{t.remove}</button></div></li>)}</ul>}
    {selected && <article className="experiment-review-history__detail"><h3>{selected.experimentDisplayName || '—'}</h3><p className="experiment-review-history__operation">{selected.operation === 'compare' ? t.compare : t.nextRound}</p><p>{new Date(selected.createdAt).toLocaleString(ko ? 'ko-KR' : 'en-US')} · {selected.locale.toUpperCase()}</p><p className="experiment-review-history__target">{targetSummary(selected, items.find(item => item.record.reviewId === selected.reviewId)?.experiment)}</p>{items.find(item => item.record.reviewId === selected.reviewId)?.orphan && <p role="status">{t.orphan}</p>}
      {selected.operation === 'compare' ? <><h4>{ko ? '비교 요약' : 'COMPARE SUMMARY'}</h4><p>{selected.response.summary}</p><h4>{ko ? '시안별 가설' : 'VARIANT HYPOTHESES'}</h4>{selected.response.variants.map(item => <section key={item.variantLabel}><h5>{item.variantLabel}: {item.hypothesis}</h5><h4>{ko ? '불확실성' : 'UNCERTAINTIES'}</h4>{list(item.uncertainties)}<h4>{ko ? '시향 확인 제안' : 'SMELLING CHECKS'}</h4>{list(item.smellingChecks)}</section>)}<h4>{ko ? '전체 불확실성' : 'OVERALL UNCERTAINTIES'}</h4>{list(selected.response.overallUncertainties)}<h4>{ko ? '전체 확인 제안' : 'OVERALL CHECKS'}</h4>{list(selected.response.overallSmellingChecks)}</> : <><p><strong>{ko ? '평가 당시 배합' : 'Evaluated composition'}:</strong> {selected.variantLabel}</p><h4>{ko ? '사람의 관찰' : 'HUMAN OBSERVATION'}</h4><p>{selected.submittedContext.evaluation.observation}</p><h4>{ko ? '판정 / 다음 행동' : 'VERDICT / NEXT ACTION'}</h4><p>{selected.submittedContext.evaluation.verdict} · {selected.submittedContext.evaluation.nextAction}</p>{selected.submittedContext.evaluation.decisionNote && <><h4>{ko ? '포함에 동의한 판단 메모' : 'CONSENTED DECISION NOTE'}</h4><p>{selected.submittedContext.evaluation.decisionNote}</p></>}<h4>{ko ? '검토 요약' : 'FINDINGS'}</h4><p>{selected.response.findings}</p><h4>{ko ? '불확실성' : 'UNCERTAINTIES'}</h4>{list(selected.response.uncertainties)}<h4>{ko ? '다음 확인 항목' : 'NEXT CHECKS'}</h4>{list(selected.response.nextChecks)}<h4>{ko ? '조정 방향' : 'ADJUSTMENT DIRECTIONS'}</h4>{list(selected.response.adjustmentDirections)}<p>{ko ? '참고 의견입니다. 자동 변경은 없습니다.' : 'Advisory only. No automatic changes were made.'}</p></>}
      <div className="ai-history-detail-footer"><button type="button" className="ai-review-delete-action" onClick={() => void remove(selected)}>{t.remove}</button><button type="button" onClick={() => setSelected(undefined)}>{t.backToHistory}</button></div>
    </article>}
  </section>
}
