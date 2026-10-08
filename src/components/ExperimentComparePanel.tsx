import { useEffect, useMemo, useRef, useState } from 'react'
import type { Experiment } from '../models/experiment'
import type { ExperimentCompareResultV1 } from '../models/experimentCompareAi'
import type { ExperimentAiCompareReviewRecord } from '../models/experimentAiReviewRecord'
import { ExperimentCompareAiError, executeExperimentCompare, prepareExperimentCompare } from '../services/experimentCompareAi'
import { makeExperimentCompareReviewRecord, persistExperimentCompareReview } from '../services/experimentCompareReviewPersistence'
import { aiConnection, validAiToken } from '../services/aiClient'
import { calculateTotalParts } from '../services/formulaCalculator'
import type { AiReviewRepository } from '../storage/aiReviewRepository'
import type { StorageMode } from '../storage/database'
import './experimentComparePanel.css'
import AiActionIcon from './AiActionIcon'

type Props = {
  experiment: Experiment
  variantIds: readonly string[]
  language: 'en' | 'ko'
  /** Set only after the effective backend request limit has been verified. */
  requestLimitBytes?: number
  requestLimitVerified?: boolean
  /** Mock-only transport seam for isolated browser QA. */
  fetcher?: typeof fetch
  reviews?: AiReviewRepository
  storageMode?: StorageMode
  getExperiment?: (id: string) => Promise<Experiment | undefined>
}
type Phase = 'idle' | 'preparing' | 'running' | 'complete' | 'failed' | 'cancelled'

export function compareReviewVersionText(labels: readonly string[]): string {
  return `BASE ↔ ${labels.join(', ')}`
}

const copy = {
  en: {
    trigger: 'AI Compare', title: 'AI Compare', eyebrow: 'EXPERIMENT COMPARE', close: 'Close AI comparison',
    intro: 'Optional analysis sends only BASE and the selected Variants to the AI service. Results are advisory and do not change this Experiment.',
    scope: 'Sent: material names, parts, valid CAS references, active dilution, and computed deltas. Not sent: Formula name, Experiment name, Variant notes, evaluations, branch intent, or unrelated Variants.',
    context: 'Review the exact comparison scope', base: 'BASE', selected: 'Selected Variants',
    consent: 'I understand and consent to send this Experiment comparison for this one request.',
    token: 'Beta access token', connect: 'Use token', connected: 'Token is held in memory only.', clear: 'Clear token', run: 'Run AI Compare', running: 'Comparing…',
    unknownLimit: 'The effective server request-size limit has not been verified. AI sending is disabled until an operator supplies the verified limit.',
    unavailable: 'AI Compare is not configured for this environment.', ineligible: 'Complete BASE and every selected Variant to exactly 1,000 parts before requesting a comparison.',
    consentRequired: 'Confirm the AI Compare disclosure for this request.', tokenInvalid: 'Enter a valid beta token.',
    failed: 'The comparison could not be completed. If the outcome is uncertain, do not retry automatically.', cancel: 'Cancel request',
    result: 'AI advisory', summary: 'COMPARE SUMMARY', objective: 'OBJECTIVE DELTA', hypotheses: 'VARIANT HYPOTHESES', hypothesis: 'AI HYPOTHESIS', uncertainty: 'UNCERTAINTIES', checks: 'SMELLING CHECKS',
    overallUncertainty: 'Overall uncertainties', overallChecks: 'Overall smelling checks', parts: 'parts', bytes: 'Request size',
    invalid: 'The selected comparison cannot be prepared. Check the selected Variants and their composition.', tooLarge: 'The request exceeds the verified size limit. Reduce the selected comparison.', missingVariant: 'A selected Variant is no longer available. Close and reopen the Comparison Sheet.',
    preparing: 'Preparing the selected comparison…', cancelled: 'Request cancelled locally. The server may have already processed it; do not retry automatically.',
    saveReview: 'Save Review', saveBusy: 'Saving…', saved: 'Saved to this device', sessionOnly: 'Saved for this session only; durable storage is unavailable.', saveFailed: 'Could not save this Review. The current result is still available.', history: 'Review History', currentHistory: 'This Experiment', allHistory: 'All Experiment Reviews', noHistory: 'No saved Experiment Reviews.', openReview: 'Open Review', backToResult: 'Back to current result', deleteReview: 'Delete Review', confirmDelete: 'Delete this saved Experiment Review? This cannot be undone.', deleteFailed: 'Could not verify deletion. The saved Review remains selected.', deleted: 'Review deleted.', orphan: 'Source Experiment is no longer available', historyLoadFailed: 'Could not load Review History.', savedAt: 'Saved', variantsLabel: 'Variants', comparedVersions: 'Compared versions', historyDetail: 'Saved Experiment Review',
  },
  ko: {
    trigger: 'AI Compare', title: 'AI Compare', eyebrow: '실험 비교', close: 'AI 비교 닫기',
    intro: '선택 기능입니다. BASE와 선택한 시안만 AI 서비스로 전송합니다. 결과는 참고용이며 이 실험을 변경하지 않습니다.',
    scope: '전송 항목: 원료명, parts, 유효한 CAS 참조, 활성 희석 정보, 계산된 차이. 미전송 항목: Formula 이름, 실험 이름, 시안 노트, 평가 기록, 브랜치 의도, 선택하지 않은 시안.',
    context: '전송 범위를 확인하세요', base: 'BASE', selected: '선택 시안',
    consent: '이번 요청에 한해 이 실험 비교를 AI 서비스로 보내는 데 동의합니다.',
    token: '베타 액세스 토큰', connect: '토큰 사용', connected: '토큰은 메모리에만 보관됩니다.', clear: '토큰 지우기', run: 'AI Compare 실행', running: '비교 중…',
    unknownLimit: '서버의 실제 요청 크기 한도를 확인하지 못했습니다. 운영자가 확인된 한도를 제공할 때까지 AI 전송은 비활성화됩니다.',
    unavailable: '현재 환경에 AI Compare가 설정되어 있지 않습니다.', ineligible: '요청 전에 BASE와 선택한 모든 시안의 합계를 정확히 1,000 parts로 맞춰 주세요.',
    consentRequired: '이번 요청의 AI Compare 전송 안내를 확인해 주세요.', tokenInvalid: '유효한 베타 토큰을 입력해 주세요.',
    failed: '비교를 완료하지 못했습니다. 처리 결과가 불확실하면 자동으로 재시도하지 마세요.', cancel: '요청 취소',
    result: 'AI 참고 결과', summary: '비교 요약', objective: '객관적 차이', hypotheses: '시안별 가설', hypothesis: 'AI 가설', uncertainty: '불확실성', checks: '시향 확인 제안',
    overallUncertainty: '전체 불확실성', overallChecks: '전체 시향 확인 제안', parts: 'parts', bytes: '요청 크기',
    invalid: '선택한 비교를 준비할 수 없습니다. 선택 시안과 배합량을 확인해 주세요.', tooLarge: '요청이 확인된 크기 한도를 초과합니다. 비교 범위를 줄여 주세요.', missingVariant: '선택한 시안을 찾을 수 없습니다. 비교 시트를 닫고 다시 열어 주세요.',
    preparing: '선택한 비교를 준비하고 있습니다…', cancelled: '요청을 브라우저에서 취소했습니다. 서버가 이미 처리했을 수 있으므로 자동 재시도하지 마세요.',
    saveReview: '리뷰 저장', saveBusy: '저장 중…', saved: '이 기기에 저장했습니다', sessionOnly: '현재 세션에만 저장했습니다. 기기 저장소를 사용할 수 없습니다.', saveFailed: '리뷰를 저장하지 못했습니다. 현재 결과는 그대로 유지됩니다.', history: '리뷰 기록', currentHistory: '현재 실험', allHistory: '전체 실험 리뷰', noHistory: '저장된 실험 리뷰가 없습니다.', openReview: '리뷰 열기', backToResult: '현재 결과로 돌아가기', deleteReview: '리뷰 삭제', confirmDelete: '저장된 실험 리뷰를 삭제할까요? 삭제 후에는 복구할 수 없습니다.', deleteFailed: '삭제 여부를 확인하지 못했습니다. 저장된 리뷰를 계속 선택 상태로 둡니다.', deleted: '리뷰를 삭제했습니다.', orphan: '원본 실험을 찾을 수 없습니다', historyLoadFailed: '리뷰 기록을 불러오지 못했습니다.', savedAt: '저장', variantsLabel: '시안', comparedVersions: '비교 버전', historyDetail: '저장된 실험 리뷰',
  },
} as const
type CompareCopy = { ineligible: string; tokenInvalid: string; failed: string; tooLarge: string; missingVariant: string }

const labels = ['V1', 'V2', 'V3', 'V4', 'V5'] as const
const errorMessages: Record<string, { en: string; ko: string }> = {
  UNAUTHORIZED: { en: 'The token was not authorized. Clear it and check with the beta operator.', ko: '토큰이 인증되지 않았습니다. 토큰을 지우고 베타 운영자에게 확인해 주세요.' },
  TOKEN_EXPIRED: { en: 'The token has expired. Contact the beta operator.', ko: '토큰이 만료되었습니다. 베타 운영자에게 문의해 주세요.' },
  TOKEN_REVOKED: { en: 'The token has been revoked. Contact the beta operator.', ko: '토큰이 폐기되었습니다. 베타 운영자에게 문의해 주세요.' },
  QUOTA_EXCEEDED: { en: 'The daily allowance has been reached.', ko: '일일 사용 한도에 도달했습니다.' },
  RATE_LIMITED: { en: 'The request rate limit has been reached. Wait before deciding whether to try again.', ko: '요청 빈도 제한에 도달했습니다. 다시 실행하기 전에 상태를 확인해 주세요.' },
  GLOBAL_LIMIT: { en: 'The test service has reached its capacity.', ko: '테스트 서비스 사용 한도에 도달했습니다.' },
  SERVICE_UNAVAILABLE: { en: 'The AI service is currently unavailable.', ko: '현재 AI 서비스를 사용할 수 없습니다.' },
  NETWORK: { en: 'The connection failed. The server may have processed the request; do not retry automatically.', ko: '연결에 실패했습니다. 서버가 요청을 처리했을 수 있으므로 자동 재시도하지 마세요.' },
  TIMEOUT: { en: 'The request timed out and its outcome is unknown. Do not retry automatically.', ko: '요청 시간이 초과되어 처리 결과를 알 수 없습니다. 자동 재시도하지 마세요.' },
  RUN_TIMEOUT: { en: 'Server processing timed out and its outcome is unknown. Do not retry automatically.', ko: '서버 처리 시간이 초과되어 결과를 알 수 없습니다. 자동 재시도하지 마세요.' },
  INVALID_RESPONSE: { en: 'The server response was invalid and was not displayed.', ko: '서버 응답이 올바르지 않아 표시하지 않았습니다.' },
}
const localizedChange = (value: string, language: 'en' | 'ko') => {
  if (language === 'en') return value
  const words: Record<string, string> = { added: '추가', removed: '삭제', adjusted: '조정', replacement: '대체', 'identity-uncertain': '정체성 불확실', material: '원료', cas: 'CAS', parts: '배합량', dilution: '희석' }
  return words[value] ?? value
}
const readableError = (error: unknown, t: CompareCopy, language: 'en' | 'ko') => {
  if (error instanceof ExperimentCompareAiError && error.code === 'INELIGIBLE_COMPOSITION') return t.ineligible
  if (error instanceof ExperimentCompareAiError && error.code === 'NO_TOKEN') return t.tokenInvalid
  if (error instanceof ExperimentCompareAiError && error.code === 'BODY_TOO_LARGE') return t.tooLarge
  if (error instanceof ExperimentCompareAiError && ['UNKNOWN_VARIANT', 'INVALID_SELECTION_STATE'].includes(error.code)) return t.missingVariant
  if (error instanceof ExperimentCompareAiError && error.code === 'ABORTED') return ''
  if (error instanceof ExperimentCompareAiError && errorMessages[error.code]) return errorMessages[error.code][language]
  return t.failed
}

export default function ExperimentComparePanel({ experiment, variantIds, language, requestLimitBytes, requestLimitVerified = false, fetcher, reviews, storageMode, getExperiment }: Props) {
  const t = copy[language]
  const orderedVariantIds = experiment.variants.filter(variant => variantIds.includes(variant.variantId)).map(variant => variant.variantId)
  const variantKey = orderedVariantIds.join('|')
  const identityKey = `${experiment.parentFormulaId}:${experiment.experimentId}:${experiment.updatedAt}:${variantKey}`
  const [open, setOpen] = useState(false)
  const [consented, setConsented] = useState(false)
  const [connected, setConnected] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<{ result: ExperimentCompareResultV1; request: ReturnType<typeof prepareExperimentCompare>['request']; variantIdsByLabel: Readonly<Record<string, string>>; locale: 'en' | 'ko'; reviewId: string; createdAt: string; experimentId: string; experimentDisplayName: string; selectedVariantIds: readonly string[]; selectedVariantLabels: readonly string[] }>()
  const [requestBytes, setRequestBytes] = useState<number>()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyScope, setHistoryScope] = useState<'current' | 'all'>('current')
  const [historyItems, setHistoryItems] = useState<Array<{ record: ExperimentAiCompareReviewRecord; orphan: boolean }>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyDetail, setHistoryDetail] = useState<ExperimentAiCompareReviewRecord>()
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'session' | 'failed'>()
  const historyGeneration = useRef(0)
  const tokenInput = useRef<HTMLInputElement>(null)
  const token = useRef('')
  const controller = useRef<AbortController | undefined>(undefined)
  const generation = useRef(0)
  const busy = useRef(false)
  const isLimitValid = requestLimitVerified && Number.isInteger(requestLimitBytes) && (requestLimitBytes ?? 0) >= 256 && (requestLimitBytes ?? 0) <= 16384
  const preparation = useMemo(() => {
    try {
      // The protocol ceiling is used only to render a local preview. It never enables execution.
      return { value: prepareExperimentCompare({ experiment, selection: { mode: 'navigation', committedIds: orderedVariantIds, draftIds: null }, locale: language, maxRequestBytes: isLimitValid ? requestLimitBytes! : 16384 }), failed: false }
    } catch (failure) { return { failure, failed: true } }
  }, [experiment, identityKey, language, isLimitValid, requestLimitBytes])
  const ready = isLimitValid && aiConnection.enabled && preparation.failed === false
  const prepared = preparation.failed ? undefined : preparation.value

  useEffect(() => {
    generation.current++
    controller.current?.abort()
    controller.current = undefined
    busy.current = false
    setPhase('idle'); setError(''); setCompleted(undefined); setRequestBytes(undefined); setConsented(false); setHistoryDetail(undefined); setSaveState(undefined)
    return () => { generation.current++; controller.current?.abort(); controller.current = undefined }
  }, [identityKey])

  useEffect(() => {
    if (!historyOpen || !reviews) return
    const current = ++historyGeneration.current
    setHistoryLoading(true); setHistoryError('')
    void (async () => {
      try {
        const records = historyScope === 'all' ? await reviews.listAllExperiments() : await reviews.listByExperiment(experiment.experimentId)
        const items = await Promise.all(records.map(async record => ({ record, orphan: getExperiment ? !(await getExperiment(record.experimentId)) : false })))
        if (historyGeneration.current === current) setHistoryItems(items)
      } catch { if (historyGeneration.current === current) setHistoryError(t.historyLoadFailed) }
      finally { if (historyGeneration.current === current) setHistoryLoading(false) }
    })()
    return () => { historyGeneration.current++ }
  }, [historyOpen, historyScope, experiment.experimentId, reviews, getExperiment, t.historyLoadFailed])

  useEffect(() => { if (open && phase === 'preparing') setPhase('idle') }, [open, preparation, phase])

  useEffect(() => () => { token.current = ''; if (tokenInput.current) tokenInput.current.value = '' }, [])

  const close = () => {
    generation.current++
    controller.current?.abort()
    controller.current = undefined
    busy.current = false
    token.current = ''
    if (tokenInput.current) tokenInput.current.value = ''
    setConnected(false); setConsented(false); setPhase('idle'); setError(''); setCompleted(undefined); setOpen(false)
    setHistoryOpen(false); setHistoryDetail(undefined); setSaveState(undefined); historyGeneration.current++
  }
  const run = async () => {
    if (!ready || !prepared || busy.current || phase === 'running') return
    if (!consented) { setError(t.consentRequired); return }
    if (!connected || !validAiToken(token.current)) { setError(t.tokenInvalid); return }
    const submittedLocale = language
    busy.current = true
    const requestGeneration = ++generation.current
    const abortController = new AbortController()
    controller.current = abortController
    setConsented(false) // One explicit consent receipt authorizes exactly one execution.
    setPhase('running'); setError(''); setCompleted(undefined); setRequestBytes(prepared.byteLength)
    try {
      const output = await executeExperimentCompare({ preparation: prepared, consent: { accepted: true, scope: 'experiment_compare', contractVersion: 1 }, token: token.current, signal: abortController.signal, ...(fetcher ? { fetcher } : {}) })
      if (generation.current !== requestGeneration || abortController.signal.aborted) return
      setCompleted({ result: output.result, request: prepared.request, variantIdsByLabel: output.metadata.variantIdsByLabel, locale: submittedLocale, reviewId: crypto.randomUUID(), createdAt: new Date().toISOString(), experimentId: experiment.experimentId, experimentDisplayName: experiment.name, selectedVariantIds: [...orderedVariantIds], selectedVariantLabels: orderedVariantIds.map((id, index) => experiment.variants.find(item => item.variantId === id)?.label ?? labels[index]) }); setSaveState(undefined); setHistoryDetail(undefined); setPhase('complete')
    } catch (failure) {
      if (generation.current !== requestGeneration || abortController.signal.aborted) return
      setError(readableError(failure, t, language)); setPhase('failed')
    } finally {
      if (generation.current === requestGeneration) { busy.current = false; controller.current = undefined; setPhase(current => current === 'running' ? 'idle' : current) }
    }
  }
  const saveReview = async () => {
    if (!completed || saveBusy || saveState === 'saved' || saveState === 'session') return
    setSaveBusy(true); setSaveState(undefined)
    const record = makeExperimentCompareReviewRecord({ reviewId: completed.reviewId, experimentId: completed.experimentId, experimentDisplayName: completed.experimentDisplayName, selectedVariantIds: completed.selectedVariantIds, selectedVariantLabels: completed.selectedVariantLabels, variantIdsByLabel: completed.variantIdsByLabel, request: completed.request, response: completed.result, locale: completed.locale, createdAt: completed.createdAt })
    const result = await persistExperimentCompareReview(reviews, record, storageMode)
    setSaveState(result === 'saved-locally' ? 'saved' : result === 'session-only' ? 'session' : 'failed')
    setSaveBusy(false)
    if (result !== 'failed') { setHistoryOpen(true); setHistoryScope('current') }
  }
  const deleteSavedReview = async (record: ExperimentAiCompareReviewRecord) => {
    if (!reviews || !window.confirm(t.confirmDelete)) return
    setHistoryError('')
    try {
      const stored = await reviews.getExperimentReview(record.reviewId)
      if (!stored || stored.reviewId !== record.reviewId) throw new Error('Review no longer exists')
      await reviews.delete(record.reviewId)
      if (await reviews.get(record.reviewId)) throw new Error('Delete was not confirmed')
      setHistoryItems(items => items.filter(item => item.record.reviewId !== record.reviewId))
      setHistoryDetail(value => value?.reviewId === record.reviewId ? undefined : value)
      setSaveState(undefined)
    } catch { setHistoryError(t.deleteFailed) }
  }
  const mappedLabel = (label: string) => {
    const index = labels.indexOf(label as typeof labels[number])
    const id = completed?.variantIdsByLabel[label]
    return index >= 0 ? experiment.variants.find(item => item.variantId === id)?.label ?? label : label
  }
  const array = (items: readonly string[]) => items.length ? <ul>{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>—</p>
  const detailLabel = (record: ExperimentAiCompareReviewRecord, label: string) => { const index = labels.indexOf(label as typeof labels[number]); return index >= 0 ? `${label} · ${record.selectedVariantLabels[index] ?? ''}`.replace(/ · $/, '') : label }

  return <section className="experiment-ai-compare" aria-label={t.title}>
    <button className="experiment-ai-compare__trigger" type="button" aria-expanded={open} onClick={() => { if (open) close(); else { setPhase('preparing'); setOpen(true); setError('') } }}>
      <AiActionIcon /> {t.trigger}
    </button>
    {open && <div className="experiment-ai-compare__panel">
      <header><div><p className="experiment-ai-compare__eyebrow">{t.eyebrow}</p><h2>{t.title}</h2></div><button type="button" aria-label={t.close} onClick={close}>×</button></header>
      <p>{t.intro}</p><p className="experiment-ai-compare__scope">{t.scope}</p>
      <section className="experiment-ai-compare__selection" aria-label={t.context}><h3>{t.context}</h3><div className="experiment-ai-compare__states"><span><strong>{t.base}</strong><small>{calculateTotalParts(experiment.baseSnapshot.rows.map(row => ({ ...row, id: row.rowId })))} / 1,000 {t.parts}</small></span>{orderedVariantIds.map((id, index) => { const variant = experiment.variants.find(item => item.variantId === id); const total = variant ? calculateTotalParts(variant.snapshot.rows.map(row => ({ ...row, id: row.rowId }))) : 0; return <span key={id}><strong>{labels[index]} · {variant?.label ?? '—'}</strong><small>{total} / 1,000 {t.parts}</small></span> })}</div></section>
      {preparation.failed ? <p role="status" className="experiment-ai-compare__warning">{preparation.failure instanceof ExperimentCompareAiError && preparation.failure.code === 'INELIGIBLE_COMPOSITION' ? t.ineligible : t.invalid}</p> : <p className="experiment-ai-compare__meta">{t.bytes}: {prepared?.byteLength ?? '—'} / {isLimitValid ? requestLimitBytes : '—'} bytes</p>}
      {!isLimitValid && <p role="status" className="experiment-ai-compare__warning">{t.unknownLimit}</p>}
      {!aiConnection.enabled && <p role="status" className="experiment-ai-compare__warning">{t.unavailable}</p>}
      <label className="experiment-ai-compare__consent"><input type="checkbox" checked={consented} disabled={!ready || phase === 'running'} onChange={event => { setConsented(event.target.checked); setError('') }}/><span>{t.consent}</span></label>
      <div className="experiment-ai-compare__token"><label htmlFor="experiment-compare-token">{t.token}</label>{!connected ? <div><input ref={tokenInput} id="experiment-compare-token" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={128}/><button type="button" disabled={!ready} onClick={() => { const candidate = tokenInput.current?.value.trim() ?? ''; if (tokenInput.current) tokenInput.current.value = ''; if (!validAiToken(candidate)) { setError(t.tokenInvalid); return } token.current = candidate; setConnected(true); setError('') }}>{t.connect}</button></div> : <div><span>{t.connected}</span><button type="button" disabled={phase === 'running'} onClick={() => { token.current = ''; setConnected(false); setCompleted(undefined); setPhase('idle'); setError(''); setConsented(false) }}>{t.clear}</button></div>}</div>
      <div className="experiment-ai-compare__actions"><button type="button" disabled={!ready || !consented || !connected || phase === 'running' || phase === 'preparing'} onClick={() => void run()}>{phase === 'running' ? t.running : phase === 'preparing' ? t.preparing : t.run}</button>{phase === 'running' && <button type="button" onClick={() => { generation.current++; busy.current = false; controller.current?.abort(); controller.current = undefined; setConsented(false); setError(''); setPhase('cancelled') }}>{t.cancel}</button>}</div>
      {phase === 'complete' && completed && reviews && <div className="experiment-ai-compare__history-actions"><button type="button" disabled={saveBusy || saveState === 'saved' || saveState === 'session'} onClick={() => void saveReview()}>{saveBusy ? t.saveBusy : t.saveReview}</button>{saveState && <span role="status">{saveState === 'saved' ? t.saved : saveState === 'session' ? t.sessionOnly : t.saveFailed}</span>}</div>}
      {reviews && <div className="experiment-ai-compare__history-actions experiment-ai-compare__history-toggle"><button type="button" aria-expanded={historyOpen} onClick={() => { setHistoryOpen(value => !value); setHistoryDetail(undefined) }}>{t.history}</button></div>}
      {historyOpen && reviews && <section className="experiment-ai-compare__history" aria-label={t.history}>
        <header><button type="button" aria-label={t.close} onClick={() => { setHistoryOpen(false); setHistoryDetail(undefined) }}>×</button></header>
        <div className="experiment-ai-compare__history-scope"><button type="button" aria-pressed={historyScope === 'current'} onClick={() => { setHistoryScope('current'); setHistoryDetail(undefined) }}>{t.currentHistory}</button><button type="button" aria-pressed={historyScope === 'all'} onClick={() => { setHistoryScope('all'); setHistoryDetail(undefined) }}>{t.allHistory}</button></div>
        {historyLoading && <p role="status">{t.preparing}</p>}{historyError && <p role="alert" className="experiment-ai-compare__warning">{historyError}</p>}
        {historyDetail ? <article className="experiment-ai-compare__history-detail"><h4>{t.historyDetail}</h4><p><strong>{historyDetail.experimentDisplayName || '—'}</strong> · {new Date(historyDetail.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')}</p>{historyItems.find(item => item.record.reviewId === historyDetail.reviewId)?.orphan && <p role="status" className="experiment-ai-compare__warning">{t.orphan}</p>}<p>{t.comparedVersions}: {compareReviewVersionText(historyDetail.selectedVariantLabels)} · {historyDetail.locale === 'ko' ? '한국어' : 'English'}</p><h4>{t.summary}</h4><p>{historyDetail.response.summary}</p><h4>{t.objective}</h4>{historyDetail.deterministicDelta.map(item => <article key={item.variantLabel}><h4>{detailLabel(historyDetail, item.variantLabel)} · {t.objective}</h4><p>{item.totalDeltaParts > 0 ? '+' : ''}{item.totalDeltaParts} {t.parts}</p><ul>{item.changes.filter(change => change.kind !== 'unchanged').map((change, index) => <li key={`${item.variantLabel}-${index}`}>{localizedChange(change.kind, language)}: {change.deltaParts > 0 ? '+' : ''}{change.deltaParts} {t.parts}{change.changedFields.length ? ` · ${change.changedFields.map(field => localizedChange(field, language)).join(', ')}` : ''}</li>)}</ul></article>)}<h4>{t.hypotheses}</h4>{historyDetail.response.variants.map(item => <article key={item.variantLabel}><h4>{detailLabel(historyDetail, item.variantLabel)} · {t.hypothesis}</h4><p>{item.hypothesis}</p><h4>{t.uncertainty}</h4>{array(item.uncertainties)}<h4>{t.checks}</h4>{array(item.smellingChecks)}</article>)}<h4>{t.uncertainty}</h4>{array(historyDetail.response.overallUncertainties)}<h4>{t.checks}</h4>{array(historyDetail.response.overallSmellingChecks)}<div className="experiment-ai-compare__history-actions"><button type="button" onClick={() => setHistoryDetail(undefined)}>{t.backToResult}</button><button type="button" onClick={() => void deleteSavedReview(historyDetail)}>{t.deleteReview}</button></div></article> : !historyLoading && !historyError && historyItems.length === 0 ? <p>{t.noHistory}</p> : !historyDetail && <ul className="experiment-ai-compare__history-list">{historyItems.map(({ record, orphan }) => <li key={record.reviewId}><div><strong>{record.experimentDisplayName || '—'}</strong><small>{new Date(record.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} · {record.locale.toUpperCase()}</small><span className="experiment-ai-compare__history-versions">{t.comparedVersions}: {compareReviewVersionText(record.selectedVariantLabels)}</span><p>{record.response.summary}</p>{orphan && <span className="experiment-ai-compare__history-orphan">{t.orphan}</span>}</div><div><button type="button" onClick={() => setHistoryDetail(record)}>{t.openReview}</button><button type="button" onClick={() => void deleteSavedReview(record)}>{t.deleteReview}</button></div></li>)}</ul>}
      </section>}
      {error && <p role="alert" className="experiment-ai-compare__warning">{error}</p>}
      {phase === 'preparing' && <p role="status">{t.preparing}</p>}
      {phase === 'cancelled' && <p role="status" className="experiment-ai-compare__warning">{t.cancelled}</p>}
      {phase === 'complete' && completed && !historyDetail && <section className="experiment-ai-compare__result" aria-live="polite"><h3>{t.result} · {completed.locale === 'ko' ? (language === 'ko' ? '한국어' : 'Korean') : (language === 'ko' ? '영어' : 'English')}</h3><h4>{t.summary}</h4><p>{completed.result.summary}</p><h4>{t.objective}</h4>{completed.request.deltas.map(item => <article key={item.variantLabel}><h4>{mappedLabel(item.variantLabel)} · {t.objective}</h4><p>{item.totalDeltaParts > 0 ? '+' : ''}{item.totalDeltaParts} {t.parts}</p><ul>{item.changes.filter(change => change.kind !== 'unchanged').map((change, index) => <li key={`${item.variantLabel}-${index}`}>{localizedChange(change.kind, language)}: {change.deltaParts > 0 ? '+' : ''}{change.deltaParts} {t.parts}{change.changedFields.length ? ` · ${change.changedFields.map(field => localizedChange(field, language)).join(', ')}` : ''}</li>)}</ul></article>)}<h4>{t.hypotheses}</h4>{completed.result.variants.map(item => <article key={item.variantLabel}><h4>{mappedLabel(item.variantLabel)} · {t.hypothesis}</h4><p>{item.hypothesis}</p><h4>{t.uncertainty}</h4>{array(item.uncertainties)}<h4>{t.checks}</h4>{array(item.smellingChecks)}</article>)}<h4>{t.uncertainty}</h4>{array(completed.result.overallUncertainties)}<h4>{t.checks}</h4>{array(completed.result.overallSmellingChecks)}</section>}
      {requestBytes !== undefined && <p className="experiment-ai-compare__meta">{t.bytes}: {requestBytes} bytes</p>}
    </div>}
  </section>
}
