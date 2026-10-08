import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula } from '../models/formula'
import { buildAIContext } from '../services/aiContextBuilder'
import { AiClientError, reviewFormula, supportedAiContext, validAiToken, type AiConnection, type AiReview } from '../services/aiClient'
import { acceptAiDisclosure, hasAiDisclosure } from '../services/aiDisclosure'
import { aiSnapshotMarker, AiRequestGate } from '../services/aiReviewRequest'
import { makeFormulaAiReviewRecord, persistFormulaAiReview, type CompletedFormulaReview } from '../services/aiReviewPersistence'
import type { AiReviewRepository } from '../storage/aiReviewRepository'
import type { FormulaAiReviewRecord } from '../models/aiReviewRecord'
import type { StorageMode } from '../storage/database'
import { aiErrorMessage, aiMessages } from '../i18n/aiMessages'
import './aiFormulaReview.css'
import AiActionIcon from './AiActionIcon'

export default function AiFormulaReview({ formula, language, connection, triggerTarget, reviews, storageMode, knownFormulaIds }: {
  formula?: Readonly<Formula>; language: 'en' | 'ko'; connection: AiConnection; triggerTarget?: HTMLElement | null
  reviews?: AiReviewRepository; storageMode?: StorageMode; knownFormulaIds?: readonly string[]
}) {
  const m = aiMessages[language]
  const id = useId()
  const [open, setOpen] = useState(false)
  const [includeName, setIncludeName] = useState(false)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [accepted, setAccepted] = useState(hasAiDisclosure)
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<AiReview>()
  const [reviewDraft, setReviewDraft] = useState<CompletedFormulaReview>()
  const [saveState, setSaveState] = useState<'unsaved' | 'saving' | 'saved' | 'failed' | 'session-only'>()
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyScope, setHistoryScope] = useState<'formula' | 'all'>('formula')
  const [historyItems, setHistoryItems] = useState<FormulaAiReviewRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [savedDetail, setSavedDetail] = useState<FormulaAiReviewRecord>()
  const [deleteError, setDeleteError] = useState(false)
  const historyRequest = useRef(0)
  const [composingMessage, setComposingMessage] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const tokenInput = useRef<HTMLInputElement>(null)
  const token = useRef('')
  const composing = useRef(false)
  const busy = useRef(false)
  const saving = useRef(false)
  const scheduled = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gate = useRef(new AiRequestGate())
  const marker = aiSnapshotMarker(formula, includeName, includeNotes)
  const latest = useRef({ formula, marker, includeName, includeNotes })
  const lastMarker = useRef(marker)
  const submitted = useRef(false)
  const loadHistory = async () => {
    const requestId = ++historyRequest.current
    const sourceId = formula?.id
    setHistoryLoading(true); setHistoryError(false); setHistoryLoaded(false); setHistoryItems([])
    try {
      if (!reviews) throw new Error('Review storage is unavailable.')
      const records = historyScope === 'all' ? await reviews.listAll() : sourceId ? await reviews.listByFormula(sourceId) : []
      if (historyRequest.current === requestId && formula?.id === sourceId) setHistoryItems(records)
    } catch {
      if (historyRequest.current === requestId) setHistoryError(true)
    } finally {
      if (historyRequest.current === requestId) { setHistoryLoading(false); setHistoryLoaded(true) }
    }
  }
  useEffect(() => {
    if (!open || !reviews) return
    void loadHistory()
    return () => { historyRequest.current++ }
  }, [open, historyScope, formula?.id, reviews])
  useEffect(() => {
    if (!historyOpen) return
    const refresh = () => { void loadHistory() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [historyOpen, historyScope, formula?.id, reviews])
  const invalidate = () => {
    clearTimeout(scheduled.current)
    gate.current.invalidate()
    busy.current = false
    setPending(false)
  }
  useLayoutEffect(() => {
    latest.current = { formula, marker, includeName, includeNotes }
    if (lastMarker.current !== marker) {
      invalidate()
      if (submitted.current) setStale(true)
      setError('')
      lastMarker.current = marker
    }
  }, [formula, marker, includeName, includeNotes])
  useEffect(() => {
    const start = () => { composing.current = true }
    const end = () => { composing.current = false }
    document.addEventListener('compositionstart', start)
    document.addEventListener('compositionend', end)
    return () => {
      document.removeEventListener('compositionstart', start)
      document.removeEventListener('compositionend', end)
      clearTimeout(scheduled.current)
      gate.current.invalidate()
      token.current = ''
    }
  }, [])
  const close = () => {
    historyRequest.current++
    invalidate(); token.current = ''; setConnected(false); setResult(undefined); setError('')
    setReviewDraft(undefined); setSaveState(undefined)
    setIncludeName(false); setIncludeNotes(false); setStale(false); submitted.current = false
    setOpen(false); trigger.current?.focus()
    setHistoryOpen(false); setSavedDetail(undefined); setDeleteError(false)
  }
  const execute = () => {
    if (busy.current) return
    const executionLocale = language
    setComposingMessage(false)
    if (composing.current) { setComposingMessage(true); return }
    busy.current = true
    // Let blur-triggered CAS and the final controlled-input commit finish first.
    scheduled.current = setTimeout(() => {
      busy.current = false
      if (composing.current) { setComposingMessage(true); return }
      const current = latest.current
      if (!current.formula) { setError('NO_FORMULA'); return }
      if (!accepted || !hasAiDisclosure()) { setAccepted(false); setError('INVALID_DISCLOSURE'); return }
      const built = buildAIContext(current.formula, { includeName: current.includeName, includeNotes: current.includeNotes })
      if (!built.ok) { setError('BUILDER'); return }
      if (!supportedAiContext(built.context)) { setError('UNSUPPORTED_CONTEXT'); return }
      const request = gate.current.begin(current.formula.id, current.marker)
      const submittedReview: Omit<CompletedFormulaReview, 'response'> = {
        reviewId: crypto.randomUUID(), sourceFormulaId: current.formula.id,
        sourceFormulaDisplayId: current.formula.formulaId, snapshot: built.context,
        locale: executionLocale, createdAt: new Date().toISOString(),
      }
      busy.current = true; submitted.current = true
      setPending(true); setStale(false); setError(''); setResult(undefined); setReviewDraft(undefined); setSaveState(undefined)
      const isCurrent = () => gate.current.isCurrent(request, latest.current.formula?.id, latest.current.marker)
      void reviewFormula({ connection, context: submittedReview.snapshot, locale: submittedReview.locale, token: token.current,
        disclosureVersion: 1, signal: request.controller.signal }).then(value => {
        if (isCurrent()) {
          setResult(value)
          setReviewDraft({ ...submittedReview, response: value })
          setSaveState('unsaved')
        }
      }).catch((failure: unknown) => {
        if (isCurrent()) setError(failure instanceof AiClientError ? failure.code : 'INTERNAL_ERROR')
      }).finally(() => {
        if (isCurrent()) { busy.current = false; setPending(false) }
      })
    }, 0)
  }
  const saveReview = async () => {
    const draft = reviewDraft
    if (!draft || saving.current || saveState === 'saved' || saveState === 'session-only') return
    saving.current = true
    setSaveState('saving')
    try {
      const state = await persistFormulaAiReview(reviews, makeFormulaAiReviewRecord(draft), storageMode)
      setSaveState(state === 'saved-locally' ? 'saved' : state)
      if (state === 'saved-locally' || state === 'session-only') void loadHistory()
    } catch {
      setSaveState('failed')
    } finally {
      saving.current = false
    }
  }
  const deleteSavedReview = async (record: FormulaAiReviewRecord) => {
    if (!reviews) return
    const selectedId = record.reviewId
    if (!window.confirm(m.confirmDeleteReview)) return
    setDeleteError(false)
    try {
      const exactRecord = await reviews.get(selectedId)
      if (!exactRecord || exactRecord.reviewId !== selectedId) throw new Error('Review changed or no longer exists.')
      await reviews.delete(selectedId)
      if (await reviews.get(selectedId)) throw new Error('Review deletion could not be confirmed.')
      setHistoryItems(items => items.filter(item => item.reviewId !== selectedId))
      setSavedDetail(value => value?.reviewId === selectedId ? undefined : value)
    } catch {
      setDeleteError(true)
    }
  }
  const built = formula ? buildAIContext(formula, { includeName, includeNotes }) : undefined
  const supported = built?.ok && supportedAiContext(built.context)
  if (!connection.enabled) return null
  return <section className="ai-review ai-notebook" aria-label="AI Review" onKeyDown={event => {
    if (event.key === 'Escape' && open && !event.nativeEvent.isComposing) { event.stopPropagation(); close() }
  }}>
    {triggerTarget && createPortal(<button ref={trigger} type="button" className={`btn ai-review-trigger${open ? ' is-open' : ''}`} aria-label={open ? 'Close AI review' : 'Open AI review'} aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)}>
      <AiActionIcon />
      <span>AI Review</span>
    </button>, triggerTarget)}
    {open && <div id={id} className="ai-review-body ai-panel">
      <header className="ai-review-heading"><div><p className="ai-review-eyebrow">AI REVIEW</p><h3>{savedDetail ? m.savedReview : historyOpen ? m.current : result ? m.currentResult : m.current}</h3></div><button className="ai-review-close" type="button" aria-label={m.close} title={m.close} onClick={close}><span aria-hidden="true">×</span></button></header>
      {reviews && <div className="ai-review-view-switch" role="group" aria-label={m.history}>
        <button type="button" aria-pressed={!historyOpen} onClick={() => { setHistoryOpen(false); setSavedDetail(undefined) }}>{m.reviewSetup}</button>
        <button type="button" aria-pressed={historyOpen} onClick={() => { setHistoryOpen(true); setSavedDetail(undefined); void loadHistory() }}>{m.history}<span aria-live="polite">{historyLoaded ? historyError ? '—' : historyItems.length : '…'}</span></button>
      </div>}
      {!historyOpen && <div className="ai-review-form">
      <p className="ai-review-mock">{m.mock}</p>
      <p className="ai-review-disclosure">{m.disclosure}</p>
      {!accepted ? <button type="button" onClick={() => { acceptAiDisclosure(); setAccepted(true) }}>{m.accept}</button> : <p>{m.accepted}</p>}
      <fieldset><legend>{m.fields}</legend>
        <label><input type="checkbox" checked={includeName} onChange={e => setIncludeName(e.target.checked)} />{m.name}</label>
        <label><input type="checkbox" checked={includeNotes} onChange={e => setIncludeNotes(e.target.checked)} />{m.notes}</label>
      </fieldset>
      <div className="ai-review-connection">
        {!connected ? <><label htmlFor={id + '-token'}>{m.token}</label><div className="ai-review-controls">
          <input ref={tokenInput} id={id + '-token'} type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={128} />
          <button type="button" onClick={() => {
            const candidate = tokenInput.current?.value.trim() ?? ''
            if (tokenInput.current) tokenInput.current.value = ''
            if (!validAiToken(candidate)) { setError('NO_TOKEN'); return }
            token.current = candidate; setConnected(true); setError('')
          }}>{m.connect}</button></div></> : <><p>{m.connected}</p><button type="button" onClick={() => {
            invalidate(); token.current = ''; setConnected(false); setResult(undefined); setError(''); setStale(submitted.current)
          }}>{m.clear}</button></>}
      </div>
      {!formula && <p role="status">{m.empty}</p>}
      {built && !built.ok && <p role="status">{m.builder}{built.error.rowIndex !== undefined ? ' (' + (built.error.rowIndex + 1) + ')' : ''}</p>}
      {built?.ok && built.warnings.length > 0 && <p role="status">{m.cas} ({built.warnings.map(w => w.rowIndex + 1).join(', ')})</p>}
      {built?.ok && !supported && <p role="status">{m.unsupported}</p>}
      <button type="button" className="ai-review-execute" disabled={pending || !formula || !supported || !accepted || !connected} onClick={execute}>{pending ? m.pending : m.execute}</button>
      <div aria-live="polite" aria-atomic="true">
        {pending && <p role="status">{m.pending}</p>}
        {composingMessage && <p role="status">{m.composition}</p>}
        {stale && <p className="ai-review-stale" role="status">{m.stale}</p>}
        {error && <p role="alert">{error === 'BUILDER' ? m.builder : error === 'NO_FORMULA' ? m.empty : aiErrorMessage(error, language)}</p>}
      </div>
      {(pending || stale || error || result) && <p className="ai-review-usage">{m.uncertain}</p>}
      {result && !savedDetail && <div className="ai-review-result" data-stale={stale}>
        <h3>{m.summary}</h3><p>{result.summary}</p>
        <h3>{m.observations}</h3><ul>{result.observations.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
        <h3>{m.next}</h3><ul>{result.nextChecks.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
      </div>}
      {result && reviewDraft && !savedDetail && <div className="ai-review-save">
        <button type="button" onClick={() => void saveReview()} disabled={saveState === 'saving' || saveState === 'saved' || saveState === 'session-only'}>{saveState === 'saving' ? m.savingReview : m.saveReview}</button>
        {saveState && <p role="status" aria-live="polite">{saveState === 'unsaved' ? m.reviewUnsaved : saveState === 'saving' ? m.savingReview : saveState === 'saved' ? m.reviewSaved : saveState === 'session-only' ? m.reviewNotDurable : m.reviewSaveFailed}</p>}
      </div>}
      </div>}
      {historyOpen && reviews && <div className="ai-review-history" aria-label={m.history}>
        {savedDetail ? <div className="ai-review-saved-detail">
          <p className="ai-review-saved-meta">{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedDetail.createdAt))} · {savedDetail.locale === 'ko' ? m.korean : m.english} · {savedDetail.sourceFormulaDisplayId ?? savedDetail.sourceFormulaId}{knownFormulaIds && !knownFormulaIds.includes(savedDetail.sourceFormulaId) ? ` · ${m.sourceUnavailable}` : ''}</p>
          <h3>{m.summary}</h3><p>{savedDetail.response.summary}</p>
          <h3>{m.observations}</h3><ul>{savedDetail.response.observations.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
          <h3>{m.next}</h3><ul>{savedDetail.response.nextChecks.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
          <div className="ai-history-detail-footer"><button type="button" className="ai-review-delete-action" onClick={() => void deleteSavedReview(savedDetail)}>{m.deleteReview}</button><button type="button" onClick={() => { setSavedDetail(undefined); setDeleteError(false) }}>{m.backToHistory}</button></div>
          {deleteError && <p className="ai-review-delete-error" role="alert">{m.deleteFailed}</p>}
        </div> : <>
        <div className="ai-review-history-heading"><div><p className="ai-review-eyebrow">AI REVIEW</p><h4>{m.savedReviews}</h4></div><div><button type="button" aria-pressed={historyScope === 'formula'} onClick={() => setHistoryScope('formula')}>{m.currentFormula}</button><button type="button" aria-pressed={historyScope === 'all'} onClick={() => setHistoryScope('all')}>{m.allReviews}</button><button type="button" onClick={() => void loadHistory()} disabled={historyLoading}>{m.refreshHistory}</button></div></div>
        {deleteError && <p className="ai-review-delete-error" role="alert">{m.deleteFailed}</p>}
        {storageMode === 'memory' && <p role="status">{m.sessionOnlyHistory}</p>}
        {historyLoading && <p role="status">{m.historyLoading}</p>}
        {historyError && <p role="alert">{m.historyLoadFailed}</p>}
        {!historyLoading && !historyError && historyItems.length === 0 && <p role="status">{m.emptyHistory}</p>}
        {!historyError && <ul className="ai-review-history-list">{historyItems.map(item => <li key={item.reviewId}><div className="ai-review-history-entry">
          <strong>{item.sourceFormulaDisplayId ?? item.sourceFormulaId}</strong><span>{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))} · {item.locale === 'ko' ? m.korean : m.english}{historyScope === 'all' && knownFormulaIds && !knownFormulaIds.includes(item.sourceFormulaId) ? ` · ${m.sourceUnavailable}` : ''}</span><span className="ai-review-history-preview">{item.response.summary}</span>
          <div className="ai-history-actions"><button type="button" onClick={() => { setSavedDetail(item); setDeleteError(false) }}>{m.openReview}</button><button type="button" className="ai-review-delete-action" onClick={() => void deleteSavedReview(item)}>{m.deleteReview}</button></div>
        </div></li>)}</ul>}
        </>}
      </div>}
    </div>}
  </section>
}
