import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './materialPalette.css'

export default function PaletteDialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const dialog = ref.current!, opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    const viewport = window.visualViewport
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight, width = viewport?.width ?? window.innerWidth
      Object.assign(dialog.style, { position: 'fixed', margin: '0', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)', top: `${(viewport?.offsetTop ?? 0) + height / 2}px`, left: `${(viewport?.offsetLeft ?? 0) + width / 2}px`, maxHeight: `${Math.max(80, height - 24)}px`, maxWidth: `${Math.max(80, width - 24)}px` })
    }
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize); window.addEventListener('resize', resize)
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize); dialog.close(); if (opener?.isConnected) { const rect = opener.getBoundingClientRect(); const target = rect.right > 0 && rect.left < window.innerWidth ? opener : document.querySelector<HTMLElement>('.notebook-toggle'); target?.focus({ preventScroll: true }) } }
  }, [])
  return createPortal(<dialog ref={ref} className={`palette-dialog ${wide ? 'palette-dialog--wide' : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closeRef.current() }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeRef.current() } }}><header><h2 id={titleId}>{title}</h2><button type="button" className="btn" aria-label="Close / 닫기" onClick={onClose}>×</button></header>{children}</dialog>, document.body)
}
