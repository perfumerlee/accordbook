import { useEffect, useRef, useState } from 'react'
import type { ExperimentRailModel } from '../services/experimentRail'
import { railCompareMessages } from '../i18n/messages'
import './experimentGenealogyRail.css'

type Props = {
  model: ExperimentRailModel
  editingState: string
  activeFamilyId: string | null
  language: 'en' | 'ko'
  onSelectBase: () => void
  onSelectVariant: (id: string) => void
  mode?: 'navigation' | 'compare'
  compareDraftIds?: readonly string[]
  compareBusy?: boolean
  onToggleCompare?: (id: string) => void
}

export default function ExperimentGenealogyRail({ model, editingState, activeFamilyId, language, onSelectBase, onSelectVariant, mode='navigation', compareDraftIds=[], compareBusy=false, onToggleCompare }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const selected = useRef<HTMLButtonElement>(null)
  const leftScrollButton = useRef<HTMLButtonElement>(null)
  const rightScrollButton = useRef<HTMLButtonElement>(null)
  const scrollRail = (direction: -1 | 1) => {
    const container = scroller.current
    if (!container) return
    container.scrollBy({ left: direction * container.clientWidth * 0.7,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const [overflow, setOverflow] = useState({ left: false, right: false })
  useEffect(() => {
    const container = scroller.current
    if (!container) return
    const update = () => {
      const left = container.scrollLeft > 1
      const right = container.scrollWidth - container.clientWidth - container.scrollLeft > 1
      // Keep keyboard focus in the Rail when an end button disappears.
      if ((!left && document.activeElement === leftScrollButton.current) ||
          (!right && document.activeElement === rightScrollButton.current)) container.focus({ preventScroll: true })
      setOverflow(previous => previous.left === left && previous.right === right ? previous : { left, right })
    }
    update()
    container.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(container)
    Array.from(container.children).forEach(child => observer.observe(child))
    return () => { container.removeEventListener('scroll', update); observer.disconnect() }
  }, [model, mode, language])
  const ko = language === 'ko'
  const comparing=mode==='compare'
  const checkbox=(id:string,label:string,name:string,count=0)=><label className="rail-check"><input type="checkbox" aria-label={railCompareMessages[language].select(name)} checked={compareDraftIds.includes(id)} disabled={compareBusy||(!compareDraftIds.includes(id)&&compareDraftIds.length>=4)} onChange={()=>onToggleCompare?.(id)}/><span>{label}{count>0&&<span className="rail-count" aria-hidden="true"> · {count}</span>}</span></label>
  const parentName = (label: string, count: number) => count ? ko ? `${label}, Branch ${count}개` : `${label}, ${count} ${count === 1 ? 'Branch' : 'Branches'}` : label
  const childName = (label: string, parent: string) => ko ? `${label}, 부모 ${parent}` : `${label}, Branch of ${parent}`
  // Selection is the only trigger: note edits and autosave must not recenter the rail.
  useEffect(() => {
    const container = scroller.current, button = selected.current
    if (!container || !button || !container.contains(button)) return
    const view = container.getBoundingClientRect(), item = button.getBoundingClientRect()
    if (item.left < view.left) container.scrollLeft -= view.left - item.left + 4
    else if (item.right > view.right) container.scrollLeft += item.right - view.right + 4
  }, [editingState])
  const all = [...model.families.flatMap(f => [f.parent, ...f.children]), ...model.additionalLegacyCandidates]
  return <div className="experiment-genealogy-rail">
    {comparing?<span className="rail-base rail-base-included" aria-label={railCompareMessages[language].baseIncluded}>BASE</span>:<button className="rail-base" type="button" aria-pressed={editingState === 'base'} onClick={onSelectBase}>BASE</button>}
    <div className="rail-viewport">
    <div className="rail-scroller" ref={scroller} tabIndex={-1}>
      {model.families.map(family => <div className="rail-family" key={family.parent.variantId}>
        {comparing?checkbox(family.parent.variantId,family.parent.label,parentName(family.parent.label,family.children.length),family.children.length):<button type="button" ref={editingState === family.parent.variantId ? selected : undefined} aria-pressed={editingState === family.parent.variantId}
          className={activeFamilyId === family.parent.variantId ? 'rail-parent rail-parent--context' : 'rail-parent'}
          aria-label={parentName(family.parent.label, family.children.length)} onClick={() => onSelectVariant(family.parent.variantId)}>
          {family.parent.label}{family.children.length > 0 && <span className="rail-count" aria-hidden="true"> · {family.children.length}</span>}
        </button>}
        {family.children.length > 0 && <div className="rail-children">{family.children.map(child => <span className="rail-node" key={child.variantId}>{comparing?checkbox(child.variantId,child.label,childName(child.label,family.parent.label)):<button type="button"
          ref={editingState === child.variantId ? selected : undefined} aria-pressed={editingState === child.variantId}
          aria-label={childName(child.label, family.parent.label)} onClick={() => onSelectVariant(child.variantId)}>{child.label}</button>}</span>)}</div>}
      </div>)}
      {model.additionalLegacyCandidates.length > 0 && <div className="rail-legacy">
        <span className="rail-legacy-label">{ko ? '이전 상태' : 'LEGACY STATES'}</span>
        <div className="rail-legacy-controls">{model.additionalLegacyCandidates.map(variant => {
          const parent = all.find(item => item.variantId === variant.parentVariantId)
          return <span className="rail-node" key={variant.variantId}>{comparing?checkbox(variant.variantId,variant.label,parent ? childName(variant.label,parent.label) : variant.label):<button type="button" ref={editingState === variant.variantId ? selected : undefined}
            aria-pressed={editingState === variant.variantId} aria-label={parent ? childName(variant.label, parent.label) : variant.label}
            onClick={() => onSelectVariant(variant.variantId)}>{variant.label}</button>}</span>
        })}</div>
      </div>}
    </div>
    {overflow.left && <div className="rail-overflow rail-overflow--left"><button ref={leftScrollButton} type="button" className="rail-scroll-button" aria-label={railCompareMessages[language].scrollLeft} title={railCompareMessages[language].scrollLeft} onClick={() => scrollRail(-1)}><span aria-hidden="true">‹</span></button></div>}
    {overflow.right && <div className="rail-overflow rail-overflow--right"><button ref={rightScrollButton} type="button" className="rail-scroll-button" aria-label={railCompareMessages[language].scrollRight} title={railCompareMessages[language].scrollRight} onClick={() => scrollRail(1)}><span aria-hidden="true">›</span></button></div>}
    </div>
  </div>
}
