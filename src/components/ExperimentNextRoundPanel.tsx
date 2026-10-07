import { useEffect, useMemo, useRef, useState } from 'react'
import type { Experiment, ExperimentVariant, VariantEvaluation } from '../models/experiment'
import type { ExperimentNextRoundResultV1 } from '../models/experimentNextRoundAi'
import type { ExperimentNextRoundReviewRecord } from '../models/experimentNextRoundAi'
import { ExperimentNextRoundAiError, executeExperimentNextRound, prepareExperimentNextRound, type ExperimentNextRoundPreparation } from '../services/experimentNextRoundAi'
import { makeExperimentNextRoundReviewRecord, persistExperimentNextRoundReview } from '../services/experimentNextRoundReviewPersistence'
import { aiConnection, validAiToken } from '../services/aiClient'
import type { AiReviewRepository } from '../storage/aiReviewRepository'
import type { StorageMode } from '../storage/database'
import './experimentNextRound.css'
import AiActionIcon from './AiActionIcon'

type Props = { experiment: Experiment; variant: ExperimentVariant; evaluation: VariantEvaluation; language: 'en' | 'ko'; requestLimitBytes?: number; requestLimitVerified?: boolean; reviews?: AiReviewRepository; storageMode?: StorageMode; disabled?: boolean }
type Done = { response: ExperimentNextRoundResultV1; preparation: ExperimentNextRoundPreparation; locale: 'ko' | 'en'; createdAt: string; reviewId: string }
type State = 'idle' | 'running' | 'complete' | 'failed' | 'cancelled'
const strings = {
  en: { trigger: 'AI Next Round', title: 'AI Next Round', close: 'Close Next Round', intro: 'Use one saved human Evaluation to consider what to check in a next experimental round. Advice never changes the Experiment.', composition: 'Composition sent', compositionDetail: 'BASE and the exact composition saved with this Evaluation: material names, parts, valid CAS references, active dilution and computed differences.', evaluation: 'Human Evaluation sent', evaluationDetail: 'The selected observation, verdict and next action are sent as reported experience, not verified measurements.', optional: 'Include the optional decision note', notes: 'OFF by default. If enabled, the decision note attached to this Evaluation is included in this one request.', consent: 'I understand and consent to send this Evaluation and its saved composition for one AI request.', token: 'Beta access token', connect: 'Use token', connected: 'Token is held in memory only.', clear: 'Clear token', run: 'Run AI Next Round', running: 'Reviewing…', cancel: 'Cancel request', save: 'Save Review', saveBusy: 'Saving…', saved: 'Saved on this device.', session: 'Saved for this session only; it is not durable.', saveFailed: 'Could not confirm the saved Review.', notConfigured: 'AI Next Round is unavailable in this environment.', limit: 'The server request-size limit has not been verified.', consentRequired: 'Accept the AI Next Round disclosure for this request.', tokenInvalid: 'Enter a valid beta token.', invalid: 'This saved Evaluation cannot be prepared for AI review.', tooLarge: 'The selected context exceeds the verified request limit.', noProvider: 'No provider response was received. Do not retry automatically.', findings: 'Findings', uncertainties: 'Uncertainties', checks: 'Next checks', directions: 'Adjustment directions', advisory: 'Advisory only · no Formula, Variant, Evaluation or Branch was changed.', delta: 'Computed BASE → evaluated composition delta', parts: 'parts', empty: '—', byteLimit: 'Request bytes', locale: 'Response language', korean: 'Korean', english: 'English' },
  ko: { trigger: 'AI Next Round', title: 'AI Next Round', close: '다음 라운드 닫기', intro: '저장된 시향 기록 하나를 바탕으로 다음 실험에서 확인할 점을 제안합니다. AI 조언은 실험 내용을 변경하지 않습니다.', composition: '전송되는 배합 정보', compositionDetail: 'BASE와 이 평가에 저장된 당시 배합만 전송합니다: 원료명, 파트, 유효한 CAS, 활성 희석 정보 및 계산된 차이.', evaluation: '전송되는 사람의 평가', evaluationDetail: '선택한 관찰, 판정, 다음 행동을 전달합니다. 이는 보고된 경험이며 검증된 측정값으로 취급하지 않습니다.', optional: '선택 메모 포함', notes: '기본값은 끔입니다. 켜면 이 평가에 저장된 종료 판단 메모를 이번 요청에 포함합니다.', consent: '이 평가와 당시 배합을 AI에 한 번 전송하는 데 동의합니다.', token: '베타 액세스 토큰', connect: '토큰 사용', connected: '토큰은 메모리에만 보관됩니다.', clear: '토큰 지우기', run: 'AI Next Round 실행', running: '검토 중…', cancel: '요청 취소', save: '리뷰 저장', saveBusy: '저장 중…', saved: '이 기기에 저장했습니다.', session: '현재 세션에만 저장되어 기기를 닫으면 유지되지 않습니다.', saveFailed: '저장된 리뷰를 확인하지 못했습니다.', notConfigured: '현재 환경에 AI Next Round가 설정되어 있지 않습니다.', limit: '서버 요청 크기 제한이 확인되지 않았습니다.', consentRequired: '이번 요청의 AI Next Round 안내를 먼저 수락해 주세요.', tokenInvalid: '유효한 베타 토큰을 입력해 주세요.', invalid: '저장된 평가를 AI 검토용으로 준비할 수 없습니다.', tooLarge: '선택한 내용이 확인된 요청 크기 제한을 넘었습니다.', noProvider: '응답을 받지 못했습니다. 자동으로 다시 요청하지 마세요.', findings: '검토 요약', uncertainties: '불확실성', checks: '다음 확인 항목', directions: '조정 방향', advisory: '참고 의견일 뿐이며 Formula, Variant, 평가, Branch를 변경하지 않았습니다.', delta: '계산된 BASE → 평가 당시 배합 차이', parts: '파트', empty: '—', byteLimit: '요청 크기', locale: '응답 언어', korean: '한국어', english: '영어' },
}
function errorText(error: unknown, t: typeof strings.ko): string {
  const code = error instanceof ExperimentNextRoundAiError ? error.code : 'NETWORK'
  if (code === 'BODY_TOO_LARGE') return t.tooLarge
  if (code === 'INVALID_EVALUATION' || code === 'EVALUATION_UNAVAILABLE') return t.invalid
  if (code === 'NO_ENDPOINT') return t.notConfigured
  return t.noProvider
}
export default function ExperimentNextRoundPanel(props: Props) {
  const { experiment, variant, evaluation, language, requestLimitBytes, requestLimitVerified, reviews, storageMode, disabled } = props
  const t = strings[language]
  const [open, setOpen] = useState(false); const [accepted, setAccepted] = useState(false); const [includeNote, setIncludeNote] = useState(false)
  const [connected, setConnected] = useState(false); const token = useRef(''); const tokenInput = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<State>('idle'); const [error, setError] = useState(''); const [done, setDone] = useState<Done>()
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState<'saved' | 'session' | 'failed'>()
  const [historyOpen, setHistoryOpen] = useState(false); const [history, setHistory] = useState<ExperimentNextRoundReviewRecord[]>([]); const [historySelected, setHistorySelected] = useState<ExperimentNextRoundReviewRecord>(); const [historyError, setHistoryError] = useState('')
  const controller = useRef<AbortController | undefined>(undefined); const generation = useRef(0)
  const identity = `${experiment.experimentId}:${variant.variantId}:${evaluation.evaluationId}`
  const preparation = useMemo(() => {
    if (!Number.isInteger(requestLimitBytes) || !requestLimitVerified) return undefined
    try { return prepareExperimentNextRound({ experiment, variantId: variant.variantId, evaluationId: evaluation.evaluationId, locale: language, includeDecisionNote: includeNote, maxRequestBytes: requestLimitBytes! }) }
    catch (failure) { return { failure } as const }
  }, [experiment, variant.variantId, evaluation.evaluationId, evaluation.updatedAt, evaluation.observation, evaluation.verdict, evaluation.nextAction, evaluation.decisionNote, language, includeNote, requestLimitBytes, requestLimitVerified])
  const prepared = preparation && 'request' in preparation ? preparation : undefined
  const failure = preparation && 'failure' in preparation ? preparation.failure : undefined
  const ready = !!prepared && aiConnection.enabled && !failure && Number.isInteger(requestLimitBytes) && !!requestLimitVerified
  const clear = () => { generation.current++; controller.current?.abort(); controller.current = undefined; token.current = ''; if (tokenInput.current) tokenInput.current.value = ''; setConnected(false); setAccepted(false); setIncludeNote(false); setPhase('idle'); setError(''); setDone(undefined); setSaved(undefined) }
  useEffect(() => { clear(); return () => { generation.current++; controller.current?.abort(); token.current = ''; if (tokenInput.current) tokenInput.current.value = '' } }, [identity, evaluation.updatedAt])
  useEffect(() => () => { generation.current++; controller.current?.abort(); token.current = ''; if (tokenInput.current) tokenInput.current.value = '' }, [])
  useEffect(() => { if (disabled && controller.current) cancel() }, [disabled])
  useEffect(() => { if (!historyOpen || !reviews) return; let active = true; setHistoryError(''); void reviews.listAllExperimentReviews().then(items => { if (active) setHistory(items.filter((item): item is ExperimentNextRoundReviewRecord => item.operation === 'next_round')) }).catch(() => { if (active) setHistoryError(language === 'ko' ? '리뷰 기록을 불러오지 못했습니다.' : 'Could not load Review History.') }); return () => { active = false } }, [historyOpen, reviews, language])
  const run = async () => {
    if (!ready || !prepared || !accepted || !connected || !validAiToken(token.current) || controller.current) return
    const submitted = prepared; const submittedLocale = language; const requestGeneration = ++generation.current; const abort = new AbortController(); controller.current = abort
    setAccepted(false); setError(''); setPhase('running'); setDone(undefined); setSaved(undefined)
    try {
      const response = await executeExperimentNextRound({ preparation: submitted, consent: { accepted: true, scope: 'experiment_next_round', contractVersion: 1 }, token: token.current, signal: abort.signal })
      if (generation.current !== requestGeneration || abort.signal.aborted) return
      setDone({ response, preparation: submitted, locale: submittedLocale, createdAt: new Date().toISOString(), reviewId: crypto.randomUUID() }); setPhase('complete')
    } catch (failure) { if (generation.current === requestGeneration && !abort.signal.aborted) { setError(errorText(failure, t)); setPhase('failed') } }
    finally { if (generation.current === requestGeneration) { controller.current = undefined; if (phase === 'running') setPhase('idle') } }
  }
  const cancel = () => { generation.current++; controller.current?.abort(); controller.current = undefined; setPhase('cancelled'); setError(''); setAccepted(false) }
  const save = async () => {
    if (!done || !reviews || saving || saved === 'saved' || saved === 'session') return
    setSaving(true); setSaved(undefined)
    const record = makeExperimentNextRoundReviewRecord({ reviewId: done.reviewId, experimentId: experiment.experimentId, experimentDisplayName: experiment.name, variantId: variant.variantId, variantLabel: variant.label, evaluationId: evaluation.evaluationId, request: done.preparation.request, response: done.response, locale: done.locale, createdAt: done.createdAt })
    const result = await persistExperimentNextRoundReview(reviews, record, storageMode)
    setSaved(result === 'saved-locally' ? 'saved' : result === 'session-only' ? 'session' : 'failed'); setSaving(false)
  }
  const deleteHistory = async (record: ExperimentNextRoundReviewRecord) => {
    if (!reviews || !window.confirm(language === 'ko' ? '저장된 다음 라운드 리뷰를 삭제할까요? 복구할 수 없습니다.' : 'Delete this saved Next Round Review? This cannot be undone.')) return
    try { const existing = await reviews.getExperimentReviewRecord(record.reviewId); if (!existing || existing.operation !== 'next_round') throw new Error('Missing review'); await reviews.delete(record.reviewId); if (await reviews.get(record.reviewId)) throw new Error('Delete not verified'); setHistory(items => items.filter(item => item.reviewId !== record.reviewId)); setHistorySelected(item => item?.reviewId === record.reviewId ? undefined : item) }
    catch { setHistoryError(language === 'ko' ? '리뷰를 삭제하거나 확인하지 못했습니다.' : 'Could not verify the Review deletion.') }
  }
  const list = (items: readonly string[]) => items.length ? <ul>{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>{t.empty}</p>
  return <section className="experiment-next-round" aria-label={t.title}>
    <button className="experiment-next-round__trigger" type="button" aria-expanded={open} onClick={() => { if (open) { clear(); setOpen(false) } else { setOpen(true); setError(''); setPhase('idle') } }}><AiActionIcon /> {t.trigger}</button>
    {open && <div className="experiment-next-round__panel">
      <header><div><p className="experiment-next-round__eyebrow">{t.title}</p><h3>{variant.label} · {new Date(evaluation.createdAt).toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US')}</h3></div><button type="button" aria-label={t.close} onClick={() => { clear(); setOpen(false) }}>×</button></header>
      <p>{t.intro}</p>
      <section className="experiment-next-round__disclosure"><h4>{t.composition}</h4><p>{t.compositionDetail}</p><h4>{t.evaluation}</h4><p>{t.evaluationDetail}</p><label><input type="checkbox" checked={includeNote} disabled={phase === 'running'} onChange={event => { setIncludeNote(event.target.checked); setDone(undefined); setSaved(undefined) }}/><span>{t.optional}<small>{t.notes}</small></span></label></section>
      {!requestLimitVerified && <p className="experiment-next-round__warning" role="status">{t.limit}</p>}{!aiConnection.enabled && <p className="experiment-next-round__warning" role="status">{t.notConfigured}</p>}{Boolean(failure) && <p className="experiment-next-round__warning" role="status">{errorText(failure, t)}</p>}
      {prepared && <p className="experiment-next-round__meta">{t.byteLimit}: {prepared.byteLength} / {prepared.maxRequestBytes} · {t.locale}: {language === 'ko' ? t.korean : t.english}</p>}
      <label className="experiment-next-round__consent"><input type="checkbox" checked={accepted} disabled={!ready || phase === 'running'} onChange={event => { setAccepted(event.target.checked); setError('') }}/><span>{t.consent}</span></label>
      <div className="experiment-next-round__token"><label htmlFor={`next-round-token-${evaluation.evaluationId}`}>{t.token}</label>{!connected ? <div><input ref={tokenInput} id={`next-round-token-${evaluation.evaluationId}`} type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={128}/><button type="button" disabled={!ready} onClick={() => { const candidate = tokenInput.current?.value.trim() ?? ''; if (tokenInput.current) tokenInput.current.value = ''; if (!validAiToken(candidate)) { setError(t.tokenInvalid); return } token.current = candidate; setConnected(true); setError('') }}>{t.connect}</button></div> : <div><span>{t.connected}</span><button type="button" disabled={phase === 'running'} onClick={() => { token.current = ''; setConnected(false); setDone(undefined); setSaved(undefined); setAccepted(false) }}>{t.clear}</button></div>}</div>
      <div className="experiment-next-round__actions"><button type="button" disabled={!ready || !accepted || !connected || phase === 'running'} onClick={() => void run()}>{phase === 'running' ? t.running : t.run}</button>{phase === 'running' && <button type="button" onClick={cancel}>{t.cancel}</button>}</div>
      {reviews && <div className="experiment-next-round__save"><button type="button" aria-expanded={historyOpen} onClick={() => { setHistoryOpen(value => !value); setHistorySelected(undefined) }}>{language === 'ko' ? '리뷰 기록' : 'Review History'}</button></div>}
      {historyOpen && <section className="experiment-next-round__history" aria-label="AI Next Round Review History"><h4>AI Next Round Review History</h4>{historyError && <p role="alert">{historyError}</p>}{historySelected ? <article><p>{historySelected.variantLabel} · {new Date(historySelected.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')}</p><h5>{t.findings}</h5><p>{historySelected.response.findings}</p><h5>{t.uncertainties}</h5>{list(historySelected.response.uncertainties)}<h5>{t.checks}</h5>{list(historySelected.response.nextChecks)}<h5>{t.directions}</h5>{list(historySelected.response.adjustmentDirections)}<div className="experiment-next-round__save"><button type="button" onClick={() => setHistorySelected(undefined)}>{language === 'ko' ? '목록' : 'Back to list'}</button><button type="button" onClick={() => void deleteHistory(historySelected)}>{language === 'ko' ? '삭제' : 'Delete'}</button></div></article> : history.length ? <ul>{history.map(record => <li key={record.reviewId}><div><strong>{record.experimentDisplayName} · {record.variantLabel}</strong><small>{new Date(record.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} · {record.locale.toUpperCase()}</small><p>{record.response.findings}</p></div><div className="experiment-next-round__save"><button type="button" onClick={() => setHistorySelected(record)}>{language === 'ko' ? '열기' : 'Open'}</button><button type="button" onClick={() => void deleteHistory(record)}>{language === 'ko' ? '삭제' : 'Delete'}</button></div></li>)}</ul> : !historyError && <p>{language === 'ko' ? '저장된 리뷰가 없습니다.' : 'No saved Reviews.'}</p>}</section>}
      {error && <p role="alert" className="experiment-next-round__warning">{error}</p>}{phase === 'cancelled' && <p role="status">{t.noProvider}</p>}
      {done && <section className="experiment-next-round__result" aria-live="polite"><h4>{t.findings}</h4><p>{done.response.findings}</p><h4>{t.delta}</h4><p>{done.preparation.request.delta.totalDeltaParts > 0 ? '+' : ''}{done.preparation.request.delta.totalDeltaParts} {t.parts}</p><ul>{done.preparation.request.delta.changes.filter(change => change.kind !== 'unchanged').map((change, index) => <li key={index}>{change.kind} · {change.deltaParts > 0 ? '+' : ''}{change.deltaParts} {t.parts} · {change.changedFields.join(', ') || '—'}</li>)}</ul><h4>{t.uncertainties}</h4>{list(done.response.uncertainties)}<h4>{t.checks}</h4>{list(done.response.nextChecks)}<h4>{t.directions}</h4>{list(done.response.adjustmentDirections)}<p className="experiment-next-round__advisory">{t.advisory}</p>{reviews && <div className="experiment-next-round__save"><button type="button" disabled={saving || saved === 'saved' || saved === 'session' || disabled} onClick={() => void save()}>{saving ? t.saveBusy : t.save}</button>{saved && <span role="status">{saved === 'saved' ? t.saved : saved === 'session' ? t.session : t.saveFailed}</span>}</div>}</section>}
    </div>}
  </section>
}
