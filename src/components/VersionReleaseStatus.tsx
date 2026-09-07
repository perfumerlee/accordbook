import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula, FormulaVersion } from '../models/formula'
import { getReleasedVersion } from '../services/formulaRelease'
import { messages } from '../i18n/messages'

export function ReleasedIndicator({ language }: { language: 'en' | 'ko' }) {
  return <span className="tm-released"><span aria-hidden="true">●</span> {messages[language].released}</span>
}

export function VersionReleaseStatus({ formula, version, versions, language, onConfirm }: {
  formula: Formula
  version: FormulaVersion
  versions: FormulaVersion[]
  language: 'en' | 'ko'
  onConfirm?: (formulaId: string, versionId: string) => Promise<void>
}) {
  const t = messages[language]
  const released = getReleasedVersion(formula, versions)
  const isReleased = released?.versionId === version.versionId
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const running = useRef(false)
  const panel = rowRef.current?.closest<HTMLElement>('.tm-panel')

  useEffect(() => {
    if (!confirming || !panel) return
    const background = Array.from(panel.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.classList.contains('tm-release-overlay'))
    const previous = background.map(element => element.inert)
    background.forEach(element => { element.inert = true })
    cancelRef.current?.focus({ preventScroll: true })
    return () => {
      background.forEach((element, index) => { element.inert = previous[index] })
      const target = actionRef.current ?? rowRef.current
      if (target?.isConnected && !target.closest('[hidden], [inert]')) target.focus({ preventScroll: true })
    }
  }, [confirming, panel])

  if (version.kind !== 'manual' || version.parentFormulaId !== formula.id) return null
  return <div ref={rowRef} className="tm-release-status" tabIndex={-1}>
    <span>{t.releaseStatus}</span>
    {isReleased ? <ReleasedIndicator language={language} /> : <button ref={actionRef} type="button" disabled={!onConfirm} onClick={() => { setError(false); setConfirming(true) }}>{t.markAsRelease}</button>}
    {confirming && panel && createPortal(<div className="tm-release-overlay">
      <div ref={dialogRef} className="tm-release-confirm" role="alertdialog" aria-modal="true" aria-labelledby="tm-release-title" aria-describedby="tm-release-description" onKeyDown={event => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (!running.current) setConfirming(false) }
        if (event.key === 'Tab') {
          event.stopPropagation()
          const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
          if (!buttons.length) { event.preventDefault(); return }
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus() }
          else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus() }
        }
      }}>
        <h3 id="tm-release-title">{t.releaseTitle(version.versionNumber!)}</h3>
        <p id="tm-release-description">{t.releaseDescription(version.versionNumber!, released?.versionNumber ?? undefined)}</p>
        {error && <p role="alert">{t.releaseFailed}</p>}
        <div className="tm-release-confirm-actions">
          <button ref={cancelRef} className="btn" type="button" disabled={busy} onClick={() => setConfirming(false)}>{t.cancel}</button>
          <button className="btn primary" type="button" disabled={busy} onClick={async () => {
            if (running.current || !onConfirm) return
            running.current = true; setBusy(true); setError(false)
            try { await onConfirm(formula.id, version.versionId); setConfirming(false) }
            catch { setError(true) }
            finally { running.current = false; setBusy(false) }
          }}>{busy ? '…' : t.markAsRelease}</button>
        </div>
      </div>
    </div>, panel)}
  </div>
}
