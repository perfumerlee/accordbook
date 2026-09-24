import { useId, useRef, useState } from 'react'
import type { EvaluationVerdict, Experiment, ExperimentVariant, VariantEvaluation } from '../models/experiment'
import { addVariantEvaluation, addVariantFromEvaluation, removeVariantEvaluation, updateVariantEvaluation, type EvaluationInput } from '../services/experimentLifecycle'
import { canCreateBranchFrom } from '../services/experimentGenealogy'
import { formatDilutionSuffix } from '../services/dilutionDisplay'
import { evaluationBranchPurpose } from '../services/evaluationDirection'
import BranchIntentFields, { type BranchIntentDraft } from './BranchIntentFields'
import './variantEvaluations.css'

const labels = {
  ko: {
    title: '시향 기록', add: '시향 기록 남기기', empty: '맡아본 느낌과 다음에 바꿔볼 것을 남겨보세요.',
    observation: '어땠나요?', verdict: '다음 방향', optional: ' (선택)',
    decisionNote: '종료 판단 메모', retainedAction: '남겨둔 다음 작업',
    save: '기록 저장', cancel: '취소', edit: '기록 수정', remove: '기록 삭제',
    snapshot: '평가 당시 배합 보기', capture: '저장할 때의 시안 배합을 함께 보존합니다.',
    preserved: '기록을 수정해도 평가 당시 배합은 그대로 유지됩니다.',
    limit: '이 Branch에서는 새 Branch를 만들 수 없습니다.',
    branchPurposes: { development: '계속 진행할 Branch', check: '확인용 Branch', comparison: '비교용 Branch' },
    linked: '이 기록에서 만든 Branch', deleteBlocked: '연결된 Branch가 있어 이 기록을 삭제할 수 없습니다.',
    confirmDelete: '이 시향 기록과 평가 당시 배합을 삭제할까요?',
    confirmCancel: '작성 중인 시향 기록을 버릴까요?', failed: '기록을 처리하지 못했습니다. 입력 내용을 확인해 주세요.',
    parts: '배합량', material: '원료', dilution: '희석', memo: '메모',
    verdicts: { continue: '계속 진행', hold: '보류', stop: '여기서 종료', uncertain: '아직 판단하지 않음' },
    directions: {
      continue: { label: '다음에 바꿔볼 것', hint: '현재 방향이 유망합니다. 바꿔볼 내용을 정해 다음 실험으로 이어가세요.', placeholder: '예: Indole을 조금 늘려 균형을 비교한다.', branch: '이 배합에서 다음 Branch 만들기' },
      hold: { label: '확인할 것', hint: '가능성은 있지만 결정을 보류합니다. 재시향할 조건이나 확인할 점을 남기세요.', placeholder: '예: 하루 뒤 같은 희석 조건에서 잔향을 다시 확인한다.', branch: '확인용 Branch 만들기' },
      stop: { label: '이 방향을 종료한 이유', hint: '이 평가에서는 실험을 끝냅니다. 새 Branch는 만들지 않으며 기존 Branch와 기록은 보존됩니다.', placeholder: '예: 목표한 투명함과 멀어져 이 방향은 종료한다.', branch: '' },
      uncertain: { label: '판단에 필요한 것', hint: '아직 판단할 정보가 부족합니다. 비교할 대상이나 더 살펴볼 점을 남기세요.', placeholder: '예: BASE와 비교해 실제로 차이를 느낄 수 있는지 확인한다.', branch: '비교용 Branch 만들기' },
    },
  },
  en: {
    title: 'Smelling notes', add: 'Record an evaluation', empty: 'Record what you noticed and what you want to try next.',
    observation: 'What did you notice?', verdict: 'Next direction', optional: ' (optional)',
    decisionNote: 'Note on finishing this direction', retainedAction: 'Previously planned action',
    save: 'Save evaluation', cancel: 'Cancel', edit: 'Edit evaluation', remove: 'Delete evaluation',
    snapshot: 'View composition at evaluation', capture: 'The current Variant composition is preserved when you save.',
    preserved: 'Editing the note keeps the original evaluation composition unchanged.',
    limit: 'A new Branch cannot be created from this Variant.',
    branchPurposes: { development: 'Development Branch', check: 'Check Branch', comparison: 'Comparison Branch' },
    linked: 'Branches from this evaluation', deleteBlocked: 'This evaluation is used by a Branch and cannot be deleted.',
    confirmDelete: 'Delete this evaluation and its saved composition?',
    confirmCancel: 'Discard the evaluation you are writing?', failed: 'Unable to process the evaluation. Please check your input.',
    parts: 'Parts', material: 'Material', dilution: 'Dilution', memo: 'Memo',
    verdicts: { continue: 'Continue', hold: 'Hold', stop: 'Finish here', uncertain: 'Not sure yet' },
    directions: {
      continue: { label: 'What to try next', hint: 'This direction looks promising. Choose a change to explore in the next experiment.', placeholder: 'For example: Increase Indole slightly and compare the balance.', branch: 'Create next Branch from this composition' },
      hold: { label: 'What to check', hint: 'There is potential, but the decision is on hold. Record what to recheck or when to smell again.', placeholder: 'For example: Check the drydown tomorrow at the same dilution.', branch: 'Create a check Branch' },
      stop: { label: 'Why finish this direction?', hint: 'Finish experimenting from this evaluation. New Branches are unavailable; existing Branches and records are kept.', placeholder: 'For example: This direction moves away from the clarity I wanted.', branch: '' },
      uncertain: { label: 'What is needed to decide?', hint: 'There is not enough information to judge yet. Record what to compare or investigate.', placeholder: 'For example: Compare with BASE to check whether there is a noticeable difference.', branch: 'Create a comparison Branch' },
    },
  },
}

type Draft = EvaluationInput & { evaluationId?: string }
export type EvaluationDrafts = Record<string, Draft | undefined>

export default function VariantEvaluations({ experiment, variant, language, disabled, onChange, drafts, onDraftsChange }: {
  experiment: Experiment
  variant: ExperimentVariant
  language: 'en' | 'ko'
  disabled: boolean
  onChange: (experiment: Experiment) => void
  drafts: EvaluationDrafts
  onDraftsChange: (drafts: EvaluationDrafts) => void
}) {
  const t = labels[language]
  const draftKey = `${experiment.experimentId}:${variant.variantId}`
  const draft = drafts[draftKey]
  const setDraft = (next: Draft | undefined) => onDraftsChange({ ...drafts, [draftKey]: next })
  const [error, setError] = useState('')
  const [branchDraft, setBranchDraft] = useState<{ evaluationId: string; purpose: NonNullable<ReturnType<typeof evaluationBranchPurpose>>; intent: BranchIntentDraft }>()
  const busy = useRef(false)
  const evaluations = [...(variant.evaluations ?? [])].reverse()
  const canBranch = canCreateBranchFrom(experiment, variant.variantId)
  const directionHintId = useId()

  const act = (operation: () => Experiment) => {
    if (disabled || busy.current) return false
    busy.current = true
    try { onChange(operation()); setError(''); return true }
    catch { setError(t.failed); return false }
    finally { busy.current = false }
  }
  const edit = (item: VariantEvaluation) => {
    setError('')
    setDraft({ evaluationId: item.evaluationId, observation: item.observation, verdict: item.verdict, nextAction: item.nextAction, decisionNote: item.decisionNote })
  }

  return <section className="variant-evaluations" aria-label={t.title}>
    <div className="variant-evaluations-heading"><h2>{t.title} <small>{evaluations.length}</small></h2>
      {!draft && <button type="button" disabled={disabled} onClick={() => { setError(''); setDraft({ observation: '', verdict: 'uncertain', nextAction: '' }) }}>{t.add}</button>}
    </div>
    {!evaluations.length && !draft && <p className="evaluation-hint">{t.empty}</p>}
    {draft && <form className="evaluation-form" onSubmit={event => {
      event.preventDefault()
      if (!draft.observation.trim()) return
      if (act(() => draft.evaluationId
        ? updateVariantEvaluation(experiment, variant.variantId, draft.evaluationId, draft)
        : addVariantEvaluation(experiment, variant.variantId, draft))) setDraft(undefined)
    }}>
      <p className="evaluation-hint">{draft.evaluationId ? t.preserved : t.capture}</p>
      <label>{t.observation}<textarea aria-label={t.observation} required autoFocus disabled={disabled} value={draft.observation} onChange={event => setDraft({ ...draft, observation: event.target.value })}/></label>
      <label>{t.verdict}<select aria-label={t.verdict} aria-describedby={directionHintId} disabled={disabled} value={draft.verdict} onChange={event => setDraft({ ...draft, verdict: event.target.value as EvaluationVerdict })}>
        {Object.entries(t.verdicts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <p id={directionHintId} className="evaluation-hint" role="status">{t.directions[draft.verdict].hint}</p>
      {draft.verdict === 'stop'
        ? <label>{t.directions.stop.label}{t.optional}<textarea aria-label={t.directions.stop.label + t.optional} disabled={disabled} placeholder={t.directions.stop.placeholder} value={draft.decisionNote ?? ''} onChange={event => setDraft({ ...draft, decisionNote: event.target.value })}/></label>
        : <label>{t.directions[draft.verdict].label}{t.optional}<textarea aria-label={t.directions[draft.verdict].label + t.optional} disabled={disabled} placeholder={t.directions[draft.verdict].placeholder} value={draft.nextAction} onChange={event => setDraft({ ...draft, nextAction: event.target.value })}/></label>}
      {draft.verdict === 'stop' && draft.nextAction && <label>{t.retainedAction}{t.optional}<textarea aria-label={t.retainedAction + t.optional} disabled={disabled} value={draft.nextAction} onChange={event => setDraft({ ...draft, nextAction: event.target.value })}/></label>}
      {draft.verdict !== 'stop' && draft.decisionNote && <label>{t.decisionNote}{t.optional}<textarea aria-label={t.decisionNote + t.optional} disabled={disabled} value={draft.decisionNote} onChange={event => setDraft({ ...draft, decisionNote: event.target.value })}/></label>}
      <div className="evaluation-actions"><button type="submit" disabled={disabled || !draft.observation.trim()}>{t.save}</button><button type="button" disabled={disabled} onClick={() => { if ((!draft.observation && !draft.nextAction && !draft.decisionNote) || window.confirm(t.confirmCancel)) setDraft(undefined) }}>{t.cancel}</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
    <div className="evaluation-list">{evaluations.map(item => {
      const branches = experiment.variants.filter(child => child.parentVariantId === variant.variantId && child.sourceEvaluationId === item.evaluationId)
      const direction = t.directions[item.verdict]
      const purpose = evaluationBranchPurpose(item.verdict)
      return <article className="evaluation-card" data-verdict={item.verdict} key={item.evaluationId}>
        <header><strong>{t.verdicts[item.verdict]}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')}</time></header>
        <p className="evaluation-observation">{item.observation}</p>
        {item.decisionNote && <p className="evaluation-next"><strong>{item.verdict === 'stop' ? t.directions.stop.label : t.decisionNote}</strong><span>{item.decisionNote}</span></p>}
        {item.nextAction && <p className="evaluation-next"><strong>{item.verdict === 'stop' ? t.retainedAction : direction.label}</strong><span>{item.nextAction}</span></p>}
        <details><summary>{t.snapshot}</summary><div className="evaluation-snapshot"><table><thead><tr><th>{t.parts}</th><th>{t.material}</th><th>CAS / Ref.</th><th>{t.dilution}</th><th>{t.memo}</th></tr></thead><tbody>
          {item.snapshot.rows.map(row => <tr key={row.rowId}><td>{row.parts}</td><td>{row.material}</td><td>{row.cas || '—'}</td><td>{formatDilutionSuffix(row.dilution) || '—'}</td><td>{row.memo || '—'}</td></tr>)}
        </tbody></table></div></details>
        {branches.length > 0 && <p className="evaluation-hint">{t.linked}: {branches.map(child => `${child.label}${child.evaluationBranchPurpose ? ` (${t.branchPurposes[child.evaluationBranchPurpose]})` : ''}`).join(', ')}</p>}
        {item.verdict === 'stop' && <p className="evaluation-hint">{direction.hint}</p>}
        <div className="evaluation-actions">
          {purpose && <button type="button" disabled={disabled || !!draft || !canBranch} title={!canBranch ? t.limit : undefined} onClick={() => setBranchDraft({evaluationId:item.evaluationId,purpose,intent:{changeIntent:item.nextAction,hypothesis:''}})}>{direction.branch}</button>}
          <button type="button" disabled={disabled || !!draft} onClick={() => edit(item)}>{t.edit}</button>
          <button type="button" disabled={disabled || !!draft || branches.length > 0} title={branches.length ? t.deleteBlocked : undefined} onClick={() => { if (window.confirm(t.confirmDelete)) act(() => removeVariantEvaluation(experiment, variant.variantId, item.evaluationId)) }}>{t.remove}</button>
        </div>
        {branchDraft?.evaluationId === item.evaluationId && purpose && <form className="branch-intent-form" onSubmit={event=>{event.preventDefault();if(!branchDraft.intent.changeIntent.trim()||!branchDraft.intent.hypothesis.trim())return;if(act(()=>addVariantFromEvaluation(experiment,variant.variantId,item.evaluationId,{branchPurpose:branchDraft.purpose,...branchDraft.intent})))setBranchDraft(undefined)}}>
          <BranchIntentFields value={branchDraft.intent} onChange={intent=>setBranchDraft({...branchDraft,intent})} language={language} purpose={branchDraft.purpose} disabled={disabled}/>
          <div className="evaluation-actions"><button type="submit" disabled={disabled||!branchDraft.intent.changeIntent.trim()||!branchDraft.intent.hypothesis.trim()}>{language==='ko'?'Branch 만들기':'Create Branch'}</button><button type="button" disabled={disabled} onClick={()=>setBranchDraft(undefined)}>{t.cancel}</button></div>
        </form>}
        {purpose && !canBranch && <p className="evaluation-hint">{t.limit}</p>}
      </article>
    })}</div>
  </section>
}
