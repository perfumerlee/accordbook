import { useEffect, useRef, useState } from 'react'
import type { ExperimentRailBranchNode, ExperimentRailModel } from '../services/experimentRail'
import { EXPERIMENT_COMPARE_LIMIT } from '../services/experimentWorkspaceState'
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
  const deepList = useRef<HTMLDivElement>(null)
  const leftScrollButton = useRef<HTMLButtonElement>(null)
  const rightScrollButton = useRef<HTMLButtonElement>(null)
  const scrollRail = (direction: -1 | 1) => {
    const container = scroller.current
    if (!container) return
    container.scrollBy({ left: direction * container.clientWidth * 0.7,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const [deepOpen, setDeepOpen] = useState(mode === 'compare' || model.deepCandidates.some(item => item.variant.variantId === editingState))
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
  const selectedPath = model.deepCandidates.find(item => item.variant.variantId === editingState)?.path ?? []
  const selectedPathIdSet = new Set(selectedPath.map(item => item.variantId))
  const selectionGroup = model.deepGroups.find(group => group.parent?.variantId === editingState || group.roots.some(root => root.path.some(item => item.variantId === editingState)) || group.roots.some(root => selectedPathIdSet.has(root.variant.variantId)))
  const [browsedGroup, setBrowsedGroup] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const groupKey = (group: typeof model.deepGroups[number]) => group.parent?.variantId ?? 'other'
  const activeGroupKey = browsedGroup && model.deepGroups.some(group => groupKey(group) === browsedGroup) ? browsedGroup : selectionGroup ? groupKey(selectionGroup) : ''
  useEffect(() => { setBrowsedGroup(null) }, [editingState])
  const selectedGroupIds = model.deepGroups.filter(group => group.parent?.variantId === editingState).map(group => group.parent!.variantId)
  const allDeepIds = model.deepGroups.flatMap(group => [
    group.parent?.variantId ?? 'other',
    ...group.roots.flatMap(function flatten(node): string[] { return [node.variant.variantId, ...node.children.flatMap(flatten)] }),
  ])
  const selectedPathIds = [...selectedPath.map(item => item.variantId), ...selectedGroupIds]
  const selectedExpansionKey = `${comparing || showAll}:` + (comparing || showAll ? allDeepIds : selectedPathIds).join('|')
  const [expandedDeepIds, setExpandedDeepIds] = useState<Set<string>>(() => new Set(comparing ? allDeepIds : selectedPathIds))
  const toggleDeep = (id: string) => setExpandedDeepIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  useEffect(() => {
    if (comparing || selectedPath.length > 2 || selectedGroupIds.length > 0 || (editingState !== 'base' && !selectionGroup)) setDeepOpen(true)
  }, [comparing, editingState, selectedPath.length, selectedGroupIds.length, selectionGroup])
  useEffect(() => {
    const ids = comparing || showAll ? allDeepIds : selectedPathIds
    setExpandedDeepIds(new Set(ids))
  }, [selectedExpansionKey])
  const countBadge=(count:number,label:string)=><span className="rail-count" aria-label={label} title={label}>{count}</span>
  const countBranchTree=(nodes:ExperimentRailBranchNode[]):number=>nodes.reduce((total,node)=>total+1+countBranchTree(node.children),0)
  const descendantCountLabel=(count:number)=>ko?`하위 브랜치 총 ${count}개 · 모든 단계 포함`:`${count} descendant ${count === 1 ? 'Branch' : 'Branches'} total · all levels included`
  const descendantCounts = new Map(model.deepGroups.filter(group => group.parent).map(group => [group.parent!.variantId, countBranchTree(group.roots)]))
  const childCountBadge = (id: string) => {
    const count = descendantCounts.get(id) ?? 0
    return count > 0 ? countBadge(count, descendantCountLabel(count)) : null
  }
  const selectedVariantLabel = [...model.families.flatMap(family => [family.parent, ...family.children]), ...model.deepCandidates.map(candidate => candidate.variant)].find(variant => variant.variantId === editingState)?.label ?? editingState
  const checkbox=(id:string,label:string,name:string,count=0,descendants=false)=><label className="rail-check"><input type="checkbox" aria-label={railCompareMessages[language].select(name)} checked={compareDraftIds.includes(id)} disabled={compareBusy||(!compareDraftIds.includes(id)&&compareDraftIds.length>=EXPERIMENT_COMPARE_LIMIT)} onChange={()=>onToggleCompare?.(id)}/><span className="rail-check-name">{label}{count>0&&countBadge(count,descendants?descendantCountLabel(count):ko?`하위 브랜치 ${count}개`:`${count} child ${count === 1 ? 'Branch' : 'Branches'}`)}</span></label>
  const parentName = (label: string, count: number) => count ? ko ? `${label}, 브랜치 ${count}개` : `${label}, ${count} ${count === 1 ? 'Branch' : 'Branches'}` : label
  const childName = (label: string, parent: string, count = 0) => (ko ? `${label}, 부모 ${parent}` : `${label}, Branch of ${parent}`) + (count > 0 ? `, ${descendantCountLabel(count)}` : '')
  // Selection is the only trigger: note edits and autosave must not recenter the rail.
  useEffect(() => {
    const container = scroller.current
    const button = container?.contains(selected.current) ? selected.current : container?.querySelector<HTMLButtonElement>('.rail-parent--context')
    if (!container || !button || !container.contains(button)) return
    const view = container.getBoundingClientRect(), item = button.getBoundingClientRect()
    if (item.left < view.left) container.scrollLeft -= view.left - item.left + 4
    else if (item.right > view.right) container.scrollLeft += item.right - view.right + 4
  }, [editingState, deepOpen])
  useEffect(() => {
    const container = deepList.current, button = selected.current
    if (!deepOpen || !container || !button || !container.contains(button) || !button.getClientRects().length) return
    const view = container.getBoundingClientRect(), item = button.getBoundingClientRect()
    if (item.top < view.top) container.scrollTop -= view.top - item.top + 4
    else if (item.bottom > view.bottom) container.scrollTop += item.bottom - view.bottom + 4
  }, [editingState, deepOpen, expandedDeepIds])
  const renderDeepNode = (node: ExperimentRailBranchNode, depth = 0) => {
    const id = node.variant.variantId
    const expanded = expandedDeepIds.has(id)
    const pathName = node.path.map(item => item.label).join(' › ')
    return <div className="rail-tree-item" key={id}>
      <div className={`rail-tree-row${selectedPathIdSet.has(id) && id !== editingState ? ' rail-tree-row--path' : ''}`}>
        {node.children.length > 0
          ? <button className="rail-tree-toggle" type="button" aria-label={ko ? `${node.variant.label} ${expanded ? '접기' : '펼치기'}` : `${expanded ? 'Collapse' : 'Expand'} ${node.variant.label}`} aria-expanded={expanded} onClick={() => toggleDeep(id)}>{expanded ? '−' : '+'}</button>
          : <span className="rail-tree-toggle-placeholder" aria-hidden="true"/>}
        {comparing ? checkbox(id, node.variant.label, pathName) : <button type="button" ref={editingState === id ? selected : undefined}
          aria-pressed={editingState === id} aria-label={pathName} onClick={() => onSelectVariant(id)}>{node.variant.label}</button>}
      </div>
      {expanded && node.children.length > 0 && <div className="rail-tree-children">{node.children.map(child => renderDeepNode(child, depth + 1))}</div>}
    </div>
  }
  return <div className="experiment-genealogy-rail">
    <div className="rail-top">
    {comparing?<span className="rail-base rail-base-included" aria-label={railCompareMessages[language].baseIncluded}>BASE</span>:<button className="rail-base" type="button" aria-pressed={editingState === 'base'} onClick={onSelectBase}>BASE</button>}
    <div className="rail-viewport">
    <div className="rail-scroller" ref={scroller} tabIndex={-1}>
      {model.families.map(family => <div className="rail-family" key={family.parent.variantId}>
        {comparing?checkbox(family.parent.variantId,family.parent.label,parentName(family.parent.label,family.children.length),family.children.length):<button type="button" ref={editingState === family.parent.variantId ? selected : undefined} aria-pressed={editingState === family.parent.variantId}
          aria-current={activeFamilyId === family.parent.variantId && editingState !== family.parent.variantId ? 'location' : undefined}
          className={activeFamilyId === family.parent.variantId ? 'rail-parent rail-parent--context' : 'rail-parent'}
          aria-label={parentName(family.parent.label, family.children.length)} onClick={() => onSelectVariant(family.parent.variantId)}>
          {family.parent.label}{family.children.length > 0 && countBadge(family.children.length,ko?`하위 브랜치 ${family.children.length}개`:`${family.children.length} child ${family.children.length === 1 ? 'Branch' : 'Branches'}`)}
        </button>}
        {family.children.length > 0 && <div className="rail-children">{family.children.map(child => <span className={`rail-node${selectedPathIdSet.has(child.variantId) && child.variantId !== editingState ? ' rail-node--path' : ''}`} key={child.variantId}>{comparing?checkbox(child.variantId,child.label,childName(child.label,family.parent.label,descendantCounts.get(child.variantId)),descendantCounts.get(child.variantId),true):<button type="button"
          ref={editingState === child.variantId ? selected : undefined} aria-pressed={editingState === child.variantId}
          aria-current={selectedPathIdSet.has(child.variantId) && child.variantId !== editingState ? 'location' : undefined}
          aria-label={childName(child.label, family.parent.label, descendantCounts.get(child.variantId))} onClick={() => onSelectVariant(child.variantId)}>{child.label}{childCountBadge(child.variantId)}</button>}</span>)}</div>}
      </div>)}
    </div>
    {overflow.left && <div className="rail-overflow rail-overflow--left"><button ref={leftScrollButton} type="button" className="rail-scroll-button" aria-label={railCompareMessages[language].scrollLeft} onClick={() => scrollRail(-1)}><span aria-hidden="true">‹</span></button></div>}
    {overflow.right && <div className="rail-overflow rail-overflow--right"><button ref={rightScrollButton} type="button" className="rail-scroll-button" aria-label={railCompareMessages[language].scrollRight} onClick={() => scrollRail(1)}><span aria-hidden="true">›</span></button></div>}
    </div>
    </div>
      {model.deepCandidates.length > 0 && <section className="rail-deep">
        <div className="rail-deep-heading"><button type="button" className="rail-deep-trigger" aria-expanded={deepOpen} onClick={() => setDeepOpen(!deepOpen)}>{deepOpen ? '−' : '+'} {ko ? '깊은 브랜치' : 'DEEP BRANCHES'} {countBadge(model.deepCandidates.length,ko?`깊은 브랜치 총 ${model.deepCandidates.length}개`:`${model.deepCandidates.length} deep Branches total`)}</button>
        {!comparing && <button type="button" className="rail-view-toggle" aria-pressed={showAll} onClick={() => {setShowAll(!showAll);setDeepOpen(true);if(!showAll)setExpandedDeepIds(new Set(allDeepIds))}}>{showAll ? (ko ? '선택 계보 보기' : 'FOCUS LINEAGE') : (ko ? '전체 계보 보기' : 'VIEW ALL LINEAGES')}</button>}</div>
        {selectedPath.length > 2 && !comparing && <nav className="rail-current-path" aria-label={ko ? '현재 브랜치 경로' : 'Current Branch path'}>
          {selectedPath.map((pathVariant, index) => <span key={pathVariant.variantId}>
            {index > 0 && <span className="rail-path-separator" aria-hidden="true">›</span>}
            <button type="button" aria-current={index === selectedPath.length - 1 ? 'location' : undefined}
              onClick={() => onSelectVariant(pathVariant.variantId)}>{pathVariant.label}</button>
          </span>)}
        </nav>}
        {deepOpen && <>
        {!comparing && !showAll && <div className="rail-parent-picker" role="group" aria-label={ko ? '탐색할 상위 브랜치' : 'Browse parent Branch'}>{model.deepGroups.map(group => {const count=countBranchTree(group.roots);return <button type="button" key={groupKey(group)} aria-pressed={activeGroupKey === groupKey(group)} onClick={() => {setBrowsedGroup(groupKey(group));setExpandedDeepIds(new Set(allDeepIds))}}>{group.parent?.label ?? (ko ? '기타' : 'OTHER')} {countBadge(count,descendantCountLabel(count))}</button>})}</div>}
        {!comparing && !showAll && !activeGroupKey ? <div className="rail-empty-state"><strong>{editingState === 'base' ? (ko ? 'BASE에서는 특정 계보가 선택되지 않았습니다.' : 'No lineage is focused while BASE is selected.') : ko ? `${selectedVariantLabel}에는 아직 깊은 브랜치가 없습니다.` : `No Deep Branches continue from ${selectedVariantLabel} yet.`}</strong><span>{editingState === 'base' ? (ko ? '위에서 부모 Variant를 선택하거나, 레일에서 시안을 선택하면 해당 계보에 집중할 수 있습니다.' : 'Choose a parent Variant above or select a Variant in the rail to focus its lineage.') : ko ? '실험 단계를 이어가려면 현재 시안에서 + 브랜치 추가를 선택하세요.' : 'To continue this experiment, choose + ADD BRANCH for the current Variant.'}</span></div> : <div className="rail-deep-groups" ref={deepList}>{model.deepGroups.filter(group => comparing || showAll || groupKey(group) === activeGroupKey).map(group => {
          const groupId = group.parent?.variantId ?? 'other'
          const expanded = comparing || showAll ? expandedDeepIds.has(groupId) : true
          const count = countBranchTree(group.roots)
          return <section className="rail-deep-group" key={groupId}>
            {(showAll || comparing) && <button type="button" className="rail-deep-group-toggle" aria-expanded={expanded}
              aria-current={group.parent?.variantId === editingState ? 'location' : undefined}
              onClick={() => toggleDeep(groupId)}>
              {expanded ? '−' : '+'} {group.parent ? (ko ? `상위 ${group.parent.label}` : `FROM ${group.parent.label}`) : (ko ? '기타 브랜치' : 'OTHER BRANCHES')} {countBadge(count,descendantCountLabel(count))}
            </button>}
            {expanded && <div className="rail-deep-group-content">{group.roots.map(node => renderDeepNode(node))}</div>}
          </section>
        })}</div>}</>}
      </section>}
  </div>
}
