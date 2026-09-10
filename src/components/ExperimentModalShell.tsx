import { useEffect, useRef, type ReactNode } from 'react'
import './experimentModalShell.css'

type Props = { title: string; formulaId: string; formulaName?: string; closeLabel: string; closeDisabled?: boolean; onClose: () => void; children: ReactNode }

export default function ExperimentModalShell({ title, formulaId, formulaName, closeLabel, closeDisabled = false, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef({ onClose, closeDisabled })
  closeRef.current = { onClose, closeDisabled }
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!closeRef.current.closeDisabled) closeRef.current.onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); dialog.focus(); return }
      const first = items[0]; const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      // Restore only when returning to the active Formula, not when entering Detail.
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll:true})
    }
  }, [])
  return <div className="experiment-modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!closeDisabled)onClose()}}><div ref={dialogRef} tabIndex={-1} className="experiment-modal" role="dialog" aria-modal="true" aria-labelledby="experiment-modal-title"><header className="experiment-modal__header"><div><div className="experiment-modal__eyebrow">{title}</div><div id="experiment-modal-title" className="experiment-modal__formula">{formulaId}{formulaName && <span> · {formulaName}</span>}</div></div><button className="experiment-modal__close" type="button" disabled={closeDisabled} aria-label={closeLabel} onClick={onClose}>×</button></header><div className="experiment-modal__rule" />{children}</div></div>
}
