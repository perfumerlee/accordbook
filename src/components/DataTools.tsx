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
  return <><button ref={trigger} type="button" className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => { onOpen(); setOpen(value => !value) }}>Data Tools ▾</button>{open && createPortal(<div ref={menu} className="data-tools-popover" role="menu" aria-label="Data Tools" style={position} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) close(false) }}>
    <button role="menuitem" onClick={() => { close(); onSample() }}><span className="data-tools-item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5c-2.3-1.3-5-1.6-8-1v13c3-.6 5.7-.3 8 1m0-13c2.3-1.3 5-1.6 8-1v13c-3-.6-5.7-.3-8 1m0-13v13" /></svg><span>{language === 'ko' ? '샘플 포뮬러' : 'Sample formulas'}</span></span></button>
    <button role="menuitem" onClick={() => { close(); onPalette() }}><span className="data-tools-item"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6m-5 0v5l-4.3 8.7A3 3 0 0 0 8.4 21h7.2a3 3 0 0 0 2.7-4.3L14 8V3M8 15h8" /></svg><span>Material Palette</span></span></button>
    <button role="menuitem" onClick={() => { close(); access.openDialog(language) }}><span className="data-tools-item"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="11" r="4" /><path d="M12 11h9m-3 0v3m-3-3v2" /></svg><span>AI Access Token</span></span><span className="data-tools-token-state" aria-label={access.connected ? (language === 'ko' ? '이번 세션에 토큰 입력됨, 서버 확인 전' : 'Token entered for this session, not server verified') : (language === 'ko' ? '토큰 미입력' : 'No token entered')} title={access.connected ? (language === 'ko' ? '이번 세션에 토큰 입력됨 · 서버 확인 전' : 'Token entered for this session · not server verified') : (language === 'ko' ? '토큰 미입력' : 'No token entered')}>{access.connected ? '●' : '○'}</span></button>
  </div>, document.body)}</>
}
