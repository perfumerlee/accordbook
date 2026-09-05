import { useLayoutEffect, useRef } from 'react'
import type { StarterFormulaTemplate } from '../data/starterFormulas'

export function StarterFormulaPicker({ starters, language, onSelect, onClose }: { starters: StarterFormulaTemplate[]; language: 'en' | 'ko'; onSelect: (starter: StarterFormulaTemplate) => void; onClose: () => void }) {
  const ko = language === 'ko'
  const pickerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    opener.current = document.querySelector<HTMLElement>('.data-actions > .btn')
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.app > .sidebar, .formula-stage, .time-machine-stage, .notebook-toggle, .drawer-scrim'))
    const previous = roots.map(root => root.inert); roots.forEach(root => { root.inert = true })
    const modal = pickerRef.current
    const first = modal?.querySelector<HTMLButtonElement>('.starter-picker-item') ?? modal?.querySelector<HTMLButtonElement>('.starter-picker-head > button')
    first?.focus({ preventScroll: true })
    const trap = (event: KeyboardEvent) => { if (event.key !== 'Tab' || !modal) return; const items = Array.from(modal.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0); const firstItem = items[0]; const last = items[items.length - 1]; if (!firstItem) return; if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstItem.focus() } }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); opener.current?.focus({ preventScroll: true }) } }
    modal?.addEventListener('keydown', trap); document.addEventListener('keydown', escape, true)
    return () => { modal?.removeEventListener('keydown', trap); document.removeEventListener('keydown', escape, true); roots.forEach((root, index) => { root.inert = previous[index] }); if (!selectedRef.current) opener.current?.focus({ preventScroll: true }) }
  }, [onClose])
  return <div ref={pickerRef} className="starter-picker" role="dialog" aria-modal="true" aria-label={ko ? '샘플 포뮬러' : 'Sample formulas'}><div className="starter-picker-head"><div><span className="side-title">{ko ? '샘플 포뮬러' : 'SAMPLE FORMULAS'}</span><h2>{ko ? '샘플로 시작하기' : 'Start with a sample'}</h2></div><button type="button" aria-label={ko ? '닫기' : 'Close'} onClick={() => { onClose(); opener.current?.focus({ preventScroll: true }) }}>×</button></div>{starters.map((starter) => <button className="starter-picker-item" type="button" key={starter.id} onClick={() => { selectedRef.current = true; onSelect(starter) }}><span><strong>{starter.title}</strong><small>{starter.description}</small></span><b>{ko ? '이 샘플 사용' : 'USE THIS SAMPLE'}</b></button>)}</div>
}
