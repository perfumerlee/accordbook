import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAiAccessToken } from './AiAccessToken'

export default function DataTools({ language, onPalette, onSample, onOpen }: { language: 'en' | 'ko'; onPalette: () => void; onSample: () => void; onOpen: () => void }) {
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 }), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), access = useAiAccessToken()
  const close = (restore = true) => { setOpen(false); if (restore) trigger.current?.focus() }
  useLayoutEffect(() => {
    if (!open) return
    const place = () => { const rect = trigger.current!.getBoundingClientRect(), height = menu.current?.offsetHeight ?? 150, width = menu.current?.offsetWidth ?? 240; setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8)) }) }
    place(); menu.current?.querySelector('button')?.focus(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true) }
  }, [open])
  return <><button ref={trigger} type="button" className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => { onOpen(); setOpen(value => !value) }}>Data Tools ▾</button>{open && createPortal(<div ref={menu} className="data-tools-popover" role="menu" aria-label="Data Tools" style={position} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(false) }}><button role="menuitem" onClick={() => { close(); onPalette() }}>Material Palette</button><button role="menuitem" onClick={() => { close(); onSample() }}>{language === 'ko' ? '샘플 포뮬러' : 'Sample formulas'}</button><button role="menuitem" onClick={() => { close(); access.openDialog(language) }}>AI Access Token <span>{access.connected ? '●' : '○'}</span></button></div>, document.body)}</>
}
