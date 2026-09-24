import type { EvaluationBranchPurpose } from '../models/experiment'

export type BranchIntentDraft = { changeIntent: string; hypothesis: string }

export default function BranchIntentFields({ value, onChange, language, purpose, disabled = false }: {
  value: BranchIntentDraft
  onChange: (value: BranchIntentDraft) => void
  language: 'en' | 'ko'
  purpose: EvaluationBranchPurpose
  disabled?: boolean
}) {
  const ko = language === 'ko'
  const purposeLabel = ko
    ? ({ development: '계속 진행', check: '확인용', comparison: '비교용' }[purpose])
    : ({ development: 'Development', check: 'Check', comparison: 'Comparison' }[purpose])
  return <fieldset className="branch-intent-fields">
    <legend>{ko ? `이번 Branch의 실험 의도 · ${purposeLabel}` : `Intent for this Branch · ${purposeLabel}`}</legend>
    <label>
      {ko ? '무엇을 바꿀 건가요?' : 'What will you change?'}
      <textarea required disabled={disabled} value={value.changeIntent} onChange={event => onChange({ ...value, changeIntent: event.target.value })}
        placeholder={ko ? '예: Indole을 조금 늘린다' : 'For example: Increase Indole slightly'} />
    </label>
    <label>
      {ko ? '어떤 결과를 예상하나요?' : 'What result do you expect?'}
      <textarea required disabled={disabled} value={value.hypothesis} onChange={event => onChange({ ...value, hypothesis: event.target.value })}
        placeholder={ko ? '예: 플로럴 인상이 선명해지지만 과해지지 않을 것이다' : 'For example: The floral impression will become clearer without turning heavy'} />
    </label>
  </fieldset>
}
