import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula } from '../models/formula'
import { buildAIContext } from '../services/aiContextBuilder'
import { AiClientError, reviewFormula, supportedAiContext, validAiToken, type AiConnection, type AiReview } from '../services/aiClient'
import { acceptAiDisclosure, hasAiDisclosure } from '../services/aiDisclosure'
import { aiSnapshotMarker, AiRequestGate } from '../services/aiReviewRequest'
import { aiErrorMessage, aiMessages } from '../i18n/aiMessages'
import './aiFormulaReview.css'

export default function AiFormulaReview({ formula, language, connection, triggerTarget }: {
  formula?: Readonly<Formula>; language: 'en' | 'ko'; connection: AiConnection; triggerTarget?: HTMLElement | null
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
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [composingMessage, setComposingMessage] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const tokenInput = useRef<HTMLInputElement>(null)
  const token = useRef('')
  const composing = useRef(false)
  const busy = useRef(false)
  const scheduled = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const gate = useRef(new AiRequestGate())
  const marker = aiSnapshotMarker(formula, includeName, includeNotes)
  const latest = useRef({ formula, marker, includeName, includeNotes })
  const lastMarker = useRef(marker)
  const submitted = useRef(false)
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
    invalidate(); token.current = ''; setConnected(false); setResult(undefined); setError('')
    setIncludeName(false); setIncludeNotes(false); setStale(false); submitted.current = false
    setOpen(false); trigger.current?.focus()
  }
  const execute = () => {
    if (busy.current) return
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
      busy.current = true; submitted.current = true
      setPending(true); setStale(false); setError(''); setResult(undefined)
      const isCurrent = () => gate.current.isCurrent(request, latest.current.formula?.id, latest.current.marker)
      void reviewFormula({ connection, context: built.context, locale: language, token: token.current,
        disclosureVersion: 1, signal: request.controller.signal }).then(value => {
        if (isCurrent()) setResult(value)
      }).catch((failure: unknown) => {
        if (isCurrent()) setError(failure instanceof AiClientError ? failure.code : 'INTERNAL_ERROR')
      }).finally(() => {
        if (isCurrent()) { busy.current = false; setPending(false) }
      })
    }, 0)
  }
  const built = formula ? buildAIContext(formula, { includeName, includeNotes }) : undefined
  const supported = built?.ok && supportedAiContext(built.context)
  if (!connection.enabled) return null
  return <section className="ai-review" aria-label="AI REVIEW" onKeyDown={event => {
    if (event.key === 'Escape' && open && !event.nativeEvent.isComposing) { event.stopPropagation(); close() }
  }}>
    {triggerTarget && createPortal(<button ref={trigger} type="button" className={`btn ai-review-trigger${open ? ' is-open' : ''}`} aria-label={open ? 'Close AI review' : 'Open AI review'} aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></svg>
      <span>AI REVIEW</span>
    </button>, triggerTarget)}
    {open && <div id={id} className="ai-review-body">
      <div className="ai-review-heading"><strong>{m.current}</strong><button className="ai-review-close" type="button" onClick={close}><span aria-hidden="true">×</span>{m.close}</button></div>
      <p className="ai-review-mock">{m.mock}</p>
      <p>{m.disclosure}</p>
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
      {result && <div className="ai-review-result" data-stale={stale}>
        <h3>{m.summary}</h3><p>{result.summary}</p>
        <h3>{m.observations}</h3><ul>{result.observations.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
        <h3>{m.next}</h3><ul>{result.nextChecks.map((item, index) => <li key={index}>{item.detail}</li>)}</ul>
      </div>}
    </div>}
  </section>
}
