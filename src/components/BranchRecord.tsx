import type { ExperimentVariant } from '../models/experiment'

export default function BranchRecord({ variant, parentLabel, language }: { variant: ExperimentVariant; parentLabel?: string; language: 'en' | 'ko' }) {
  const { origin, intent } = variant
  if (!origin && !intent) return null
  const ko = language === 'ko'
  const purpose = intent?.branchPurpose ?? origin!.branchPurpose
  const purposeLabel = ko ? {development:'계속 진행',check:'확인용',comparison:'비교용'}[purpose] : {development:'Development Branch',check:'Check Branch',comparison:'Comparison Branch'}[purpose]
  const verdictLabel = origin && (ko ? {continue:'계속 진행',hold:'보류',uncertain:'아직 판단하지 않음',stop:'여기서 종료'}[origin.verdict] : {continue:'Continue',hold:'Hold',uncertain:'Not sure yet',stop:'Finish here'}[origin.verdict])
  return <section className="branch-record" aria-label={ko ? 'Branch 기록' : 'Branch record'}>
    <header className="branch-record-header"><span>{ko ? 'BRANCH 기록' : 'BRANCH RECORD'} · {variant.label}</span><span className="branch-record-purpose"><span className="branch-record-purpose-label">{ko ? '생성 목적' : 'PURPOSE'}</span><strong>{purposeLabel}</strong></span></header>
    <div className={`branch-record-columns${origin && intent ? '' : ' branch-record-columns--single'}`}>
      {origin && <section className="branch-record-origin">
        <h3>{ko ? '이 Branch가 만들어진 이유' : 'Why this Branch was created'}</h3>
        {parentLabel && <p className="branch-record-source">{ko ? `${parentLabel}의 시향 기록에서` : `From the evaluation of ${parentLabel}`}</p>}
        <dl><div><dt>{ko ? '관찰' : 'What was noticed'}</dt><dd>{origin.observation}</dd></div>
          <div className="branch-record-decision"><dt>{ko ? '당시 판단' : 'Decision'}</dt><dd>{verdictLabel}</dd></div>
          <div><dt>{ko ? '다음에 확인할 것' : 'What was needed to decide'}</dt><dd>{origin.nextAction || '—'}</dd></div>
          {origin.decisionNote && <div><dt>{ko ? '판단 메모' : 'Decision note'}</dt><dd>{origin.decisionNote}</dd></div>}
        </dl>
      </section>}
      {intent && <section className="branch-record-intent">
        <h3>{ko ? '이번 Branch에서 검증할 것' : 'What this Branch will test'}</h3>
        <dl><div><dt>{ko ? '바꿀 내용' : 'Planned change'}</dt><dd>{intent.changeIntent}</dd></div>
          <div><dt>{ko ? '예상 결과' : 'Expected result'}</dt><dd>{intent.hypothesis}</dd></div></dl>
      </section>}
    </div>
  </section>
}
