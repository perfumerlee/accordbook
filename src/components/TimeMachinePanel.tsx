import { ScaleBatchView } from './ScaleBatchView'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Formula, FormulaVersion, FormulaVersionSnapshot } from '../models/formula'
import type { AccordbookStorage } from '../storage/storageService'
import { createFormulaVersion, listFormulaVersions } from '../services/formulaVersionLifecycle'
import { calculateFormulaTotals } from '../services/formulaCalculator'
import { messages } from '../i18n/messages'
import { isMeaningfulFormulaRow } from '../services/formulaVersionCompare'
import { FormulaCompareView } from './FormulaCompareView'
import { restoreFormulaVersion } from '../services/formulaVersionLifecycle'

export const TIME_MACHINE_TABS = ['version', 'compare'] as const
type TimeMachineTab = typeof TIME_MACHINE_TABS[number]

function usable(element: HTMLElement | null): element is HTMLElement {
  return !!element && element.isConnected && !element.matches(':disabled') && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

export function formatVersionNote(version: FormulaVersion, language: 'en' | 'ko'): string {
  if (version.kind === 'restore-point' && language === 'ko') {
    const match = /^Before restoring (v\d+)$/i.exec(version.note.trim())
    if (match) return `복원 전 버전 : ${match[1]}`
  }
  return version.note
}

export default function TimeMachinePanel({ formula, storage, language, onClose, onBeforeSaveVersion, onRestore, onCreateAsNew, isOpen, opener, openSequence = 0 }: { formula: Formula; storage: AccordbookStorage; language: 'en' | 'ko'; onClose: () => void; onBeforeSaveVersion?: () => Promise<void>; onRestore?: (formula: Formula) => Promise<void>; onCreateAsNew?: (version: FormulaVersion) => Promise<void>; isOpen: boolean; opener?: HTMLElement | null; openSequence?: number }) {
  const t = messages[language]
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const focusFrameRef = useRef<number | undefined>(undefined)
  const returnPending = useRef(false)
  const [companion, setCompanion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1840px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1840px)')
    const change = () => setCompanion(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  const cancelFocusFrame = () => { window.cancelAnimationFrame(focusFrameRef.current ?? 0); focusFrameRef.current = undefined }
  const cancelClose = () => { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = undefined }
  const [batchOpen, setBatchOpen] = useState(false)
  const [creatingAsNew, setCreatingAsNew] = useState(false)
  const handoffRef = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const batchActionRef = useRef<HTMLButtonElement>(null)
  const batchBackRef = useRef<HTMLButtonElement>(null)
  const detailScroll = useRef(0)
  const openBatch = () => {
    detailScroll.current = contentRef.current?.scrollTop ?? 0
    setBatchOpen(true)
  }
  const backToVersion = () => {
    setBatchOpen(false)
    setActiveTab('version')
    batchReturnPending.current = true
  }
  const formulaIdRef = useRef(formula.id); const [versions, setVersions] = useState<FormulaVersion[]>([]); const [compareTarget, setCompareTarget] = useState<FormulaVersion>(); const [activeTab, setActiveTab] = useState<TimeMachineTab>("version"); const [selected, setSelected] = useState<FormulaVersion>(); const [noteOpen, setNoteOpen] = useState(false); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [restoring, setRestoring] = useState(false); const [restoreConfirm, setRestoreConfirm] = useState(false); const [closing, setClosing] = useState(false); const [contextChanging, setContextChanging] = useState(false); const ko = language === 'ko'
  const batchReturnPending = useRef(false)
  const live = useRef({ isOpen, formulaId: formula.id, batchOpen, versionId: selected?.versionId, openSequence })
  useLayoutEffect(() => { live.current = { isOpen, formulaId: formula.id, batchOpen, versionId: selected?.versionId, openSequence } })
  useLayoutEffect(() => {
    cancelClose(); cancelFocusFrame(); returnPending.current = false; batchReturnPending.current = false; setClosing(false)
    return () => { cancelClose(); cancelFocusFrame() }
  }, [formula.id, openSequence])
  useLayoutEffect(() => {
    if (!isOpen || companion) return
    const panel = panelRef.current
    if (!panel) return
    // Inert only background branches; the Time Machine sibling stays usable.
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.app > .sidebar, .formula-stage, .app > .starter-picker-backdrop, .app > .first-start-backdrop, .notebook-toggle, .drawer-scrim'))
    const previous = roots.map(root => root.inert)
    roots.forEach(root => { root.inert = true })
    if (!panel.contains(document.activeElement)) closeRef.current?.focus({ preventScroll: true })
    const containFocus = (event: FocusEvent) => { if (!panel.contains(event.target as Node)) closeRef.current?.focus({ preventScroll: true }) }
    document.addEventListener('focusin', containFocus)
    return () => { document.removeEventListener('focusin', containFocus); roots.forEach((root, index) => { root.inert = previous[index] }) }
  }, [isOpen, companion, openSequence])
  useLayoutEffect(() => {
    if (isOpen) { cancelClose(); returnPending.current = false; return }
    cancelClose(); cancelFocusFrame()
    if (returnPending.current && !handoffRef.current) { returnPending.current = false; if (usable(opener ?? null)) opener!.focus({ preventScroll: true }) }
    handoffRef.current = false
  }, [isOpen, opener])
  useEffect(() => {
    cancelFocusFrame()
    if (!isOpen || closing || !selected || (!batchOpen && !batchReturnPending.current)) return
    const context = { formulaId: formula.id, versionId: selected.versionId, openSequence, batchOpen }
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = undefined
      const current = live.current
      if (!current.isOpen || closeTimerRef.current !== undefined || current.formulaId !== context.formulaId || current.versionId !== context.versionId || current.openSequence !== context.openSequence || current.batchOpen !== context.batchOpen) return
      const target = batchOpen ? batchBackRef.current : batchActionRef.current
      if (usable(target)) { target.focus({ preventScroll: true }); if (contentRef.current) contentRef.current.scrollTop = batchOpen ? 0 : detailScroll.current }
      batchReturnPending.current = false
    })
    return cancelFocusFrame
  }, [isOpen, closing, batchOpen, formula.id, selected?.versionId, openSequence])
  const reload = async () => setVersions(await listFormulaVersions(storage, formula.id)); const formulaContextChanged = formula.id !== formulaIdRef.current; useEffect(() => { formulaIdRef.current = formula.id; setSelected(undefined); setBatchOpen(false); setCompareTarget(undefined); setActiveTab("version"); setNoteOpen(false); setRestoreConfirm(false); setContextChanging(true); const timer = window.setTimeout(() => setContextChanging(false), 160); void reload(); return () => window.clearTimeout(timer) }, [formula.id])
  const save = async () => { setSaving(true); try { await onBeforeSaveVersion?.(); await createFormulaVersion(storage, formula, note); setNote(''); setNoteOpen(false); await reload() } finally { setSaving(false) } }
  useEffect(() => { if (isOpen) { setClosing(false); setBatchOpen(false); setActiveTab("version") } }, [isOpen]);
  useEffect(() => { if (!isOpen || !ko) return; document.querySelectorAll<HTMLElement>('.tm-header-meta').forEach((element) => { element.textContent = element.textContent?.replace(/(\d+) VERSIONS?/, (_, count) => `${count} 버전`) ?? element.textContent }) }, [isOpen, ko, versions.length])
  const requestClose = () => {
    if (!isOpen || closeTimerRef.current !== undefined) return
    cancelFocusFrame()
    setClosing(true)
    const context = live.current
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined
      if (!live.current.isOpen || live.current.formulaId !== context.formulaId || live.current.openSequence !== context.openSequence) return
      returnPending.current = true
      onClose()
    }, 280)
  }
  const createAsNew = async () => { if (!selected || !onCreateAsNew || creatingAsNew) return; setCreatingAsNew(true); try { await onCreateAsNew(selected); handoffRef.current = true; returnPending.current = false; onClose() } finally { setCreatingAsNew(false) } }
  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!isOpen) return
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault(); event.stopPropagation()
      if (restoreConfirm) { setRestoreConfirm(false); panelRef.current?.querySelector<HTMLButtonElement>('.tm-make-batch')?.focus({ preventScroll: true }) }
      else requestClose()
      return
    }
    if (event.key !== 'Tab' || companion || closing) return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]') ?? []).filter(element => element.tabIndex >= 0 && usable(element))
    const first = items[0]; const last = items[items.length - 1]
    if (!first) { event.preventDefault(); panelRef.current?.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus() }
  }
  const date = (value: string) => new Date(value).toLocaleString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const restore = async () => { if (!selected || restoring) return; setRestoring(true); try { await onBeforeSaveVersion?.(); const restored = await restoreFormulaVersion(storage, formula, selected); await onRestore?.(restored); setRestoreConfirm(false); setSelected(undefined); setActiveTab("version"); await reload() } finally { setRestoring(false) } }
  const selectTab = (tab: TimeMachineTab) => {
    if (tab === 'compare') setCompareTarget(compareTarget ?? selected)
    setActiveTab(tab)
  }
  return <div className={`tm-backdrop ${closing ? 'is-closing' : ''}`}>
    <section ref={panelRef} tabIndex={-1} inert={!isOpen} onKeyDown={handlePanelKeyDown} className={'tm-panel ' + (selected ? 'tm-detail ' : '') + ((contextChanging || formulaContextChanged) ? 'tm-context-switch' : '')} role="dialog" aria-modal={!companion ? true : undefined} aria-label="Time Machine">
      <header><div><h2>TIME MACHINE</h2><p className="tm-header-meta">{formula.formulaId} · {versions.filter(version => version.kind === 'manual').length} {ko ? '버전' : 'VERSIONS'}</p></div><button ref={closeRef} className="tm-close" type="button" aria-label={ko ? '닫기' : 'Close'} onClick={requestClose}>×</button></header>
      {!batchOpen && <div className="tm-view-tabs" role="tablist" aria-label="Time Machine">
        {TIME_MACHINE_TABS.map((tab, index) => <button key={tab} id={`tm-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`tm-view-${tab}`} tabIndex={activeTab === tab ? 0 : -1} className={activeTab === tab ? 'active' : ''} onClick={() => selectTab(tab)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % TIME_MACHINE_TABS.length : event.key === 'ArrowLeft' ? (index + TIME_MACHINE_TABS.length - 1) % TIME_MACHINE_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TIME_MACHINE_TABS.length - 1 : undefined
          if (next !== undefined) { event.preventDefault(); selectTab(TIME_MACHINE_TABS[next]); document.getElementById(`tm-tab-${TIME_MACHINE_TABS[next]}`)?.focus() }
        }}>{tab === 'version' ? (ko ? '버전' : 'VERSION') : (ko ? '비교' : 'COMPARE')}</button>)}
      </div>}
      <div className="tm-content" ref={contentRef}>
        <div id="tm-view-version" role="tabpanel" aria-labelledby="tm-tab-version" hidden={batchOpen || activeTab !== 'version'}>
          {selected ? <><button className="tm-version-list-back" type="button" onClick={() => setSelected(undefined)}>← {t.batchVersionList}</button><h2 className="tm-version-title">{selected.kind === 'manual' ? `v${selected.versionNumber}` : (ko ? '복원 지점' : 'RESTORE POINT')}</h2><div className="tm-version-meta"><span>{ko ? '읽기 전용' : 'READ ONLY'}</span><time>{date(selected.createdAt)}</time></div>{selected.note && <div className="tm-note"><span>{ko ? '버전 메모' : 'VERSION NOTE'}</span><p>{selected.note}</p></div>}{Array.isArray(selected.snapshot?.rows) ? <HistoricalFormula snapshot={selected.snapshot} language={language} /> : <p className="tm-batch-helper">{t.batchUnavailable}</p>}<div className="tm-restore-action">{restoreConfirm ? <div className="tm-restore-confirm" role="alertdialog" aria-label={ko ? '복원 확인' : 'Restore confirmation'}><strong>{ko ? `v${selected.versionNumber ?? ''}를 현재 포뮬러로 복원할까요?` : `Restore ${selected.kind === 'manual' ? `v${selected.versionNumber}` : 'this restore point'} to Current?`}</strong><p>{ko ? '현재 포뮬러의 내용이 이 버전으로 변경됩니다. 기존 버전 기록은 그대로 유지됩니다.' : 'The current formula will be replaced with this version. Your version history will be kept.'}</p><div><button className="btn" type="button" onClick={() => setRestoreConfirm(false)}>{ko ? '취소' : 'CANCEL'}</button><button className="btn primary" type="button" disabled={restoring} onClick={() => void restore()}>{restoring ? '…' : (ko ? '복원' : 'RESTORE')}</button></div></div> : <><button className="tm-restore-button" type="button" onClick={() => setRestoreConfirm(true)}><svg className="tm-restore-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 5 11l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 11h7a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><span>{ko ? '이 버전 복원' : 'RESTORE THIS VERSION'}</span></button><button className="tm-restore-button" type="button" disabled={creatingAsNew} onClick={() => void createAsNew()}>{creatingAsNew ? '…' : (ko ? '새 포뮬러로 만들기' : 'CREATE AS NEW')}</button></>}<button ref={batchActionRef} className="tm-restore-button tm-make-batch" type="button" onClick={openBatch}>{t.makeBatch}</button></div><button className="tm-detail-back" type="button" onClick={() => setSelected(undefined)}>← TIME MACHINE</button></> : <div className="tm-timeline"><div className="tm-current"><b>● {ko ? '현재' : 'CURRENT'}</b><span>{date(formula.updatedAt)}</span><small>{ko ? '편집 가능한 현재 Formula' : 'Current working formula'}</small></div><button className="tm-save" type="button" onClick={() => setNoteOpen(true)}>{ko ? '+ 버전 저장' : '+ SAVE VERSION'}</button>{noteOpen && <div className="tm-save-box"><label>{ko ? '버전 메모' : 'Version note'}<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={ko ? '실험 또는 시향 메모 (선택)' : 'Optional experiment or sensory note'} /></label><div><button className="btn" type="button" onClick={() => setNoteOpen(false)}>{ko ? '취소' : 'Cancel'}</button><button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '…' : (ko ? '버전 저장' : 'Save Version')}</button></div></div>}{versions.length === 0 && <div className="tm-empty"><strong>{ko ? '저장된 버전이 없습니다.' : 'No saved versions yet.'}</strong><span>{ko ? '나중에 돌아올 수 있도록 의미 있는 Formula 단계를 저장하세요.' : 'Save a meaningful stage of your formula to return to it later.'}</span></div>}{[...versions].reverse().map((version) => <button className={`tm-item ${version.kind}`} key={version.versionId} type="button" onClick={() => { setSelected(version); setCompareTarget(undefined); setActiveTab("version") }}><b>{version.kind === 'manual' ? `○ v${version.versionNumber}` : `◇ ${ko ? '복원 지점' : 'RESTORE POINT'}`}</b><span>{date(version.createdAt)}</span>{version.note && <small>{formatVersionNote(version, language)}</small>}</button>)}</div>}
        </div>
        <div id="tm-view-compare" role="tabpanel" aria-labelledby="tm-tab-compare" hidden={batchOpen || activeTab !== 'compare'}>
          {Array.isArray((compareTarget ?? selected)?.snapshot?.rows) ? <FormulaCompareView key={(compareTarget ?? selected)!.versionId} from={(compareTarget ?? selected)!.snapshot} to={formula} versions={versions} language={language} /> : <p className="tm-batch-helper">{t.compareSelectVersion}</p>}
        </div>
        <div className="tm-batch-workspace" role="region" aria-labelledby="tm-batch-title" hidden={!batchOpen}>
          <button ref={batchBackRef} className="tm-batch-back" type="button" aria-label={t.batchBack + ': ' + (selected?.kind === 'manual' ? 'v' + selected.versionNumber : t.batchRestorePoint)} onClick={backToVersion}>← {selected?.kind === 'manual' ? 'v' + selected.versionNumber : t.batchRestorePoint}</button>
          <ScaleBatchView key={formula.id + ':' + String(isOpen)} version={formulaContextChanged ? undefined : selected} language={language} />
        </div>
      </div>
    </section>
  </div>
}

function HistoricalFormula({ snapshot, language }: { snapshot: FormulaVersionSnapshot; language: 'en' | 'ko' }) { const ko = language === 'ko'; const t = messages[language]; const historicalRows = snapshot.rows.map((row) => ({ ...row, id: row.rowId })); const totals = calculateFormulaTotals(historicalRows); const materials = snapshot.rows.filter(isMeaningfulFormulaRow); return <div className="tm-historical-formula"><div className="tm-history-header"><span>{ko ? '포뮬러 / 어코드 제목' : 'FORMULA / ACCORD TITLE'}</span><h3>{snapshot.name || (ko ? '제목 없음' : 'Untitled')}</h3><dl><dt>{ko ? '포뮬러 ID' : 'FORMULA ID'}</dt><dd>{snapshot.formulaId || '—'}</dd><dt>{ko ? '날짜' : 'DATE'}</dt><dd>{snapshot.date || '—'}</dd><dt>{ko ? '출처' : 'ORIGIN'}</dt><dd>—</dd></dl></div><div className="tm-materials"><div className="tm-section-label tm-material-header"><span className="tm-material-parts">{ko ? t.parts : 'PARTS'}</span><span className="tm-material-name">{ko ? t.material : 'MATERIAL NAME'} <small>[{materials.length}]</small></span></div>{snapshot.rows.map((row) => isMeaningfulFormulaRow(row) ? <div className={"tm-historical-row"} key={row.rowId} data-row-id={row.rowId}><strong className={"tm-historical-parts"}>{row.parts || 0}</strong><div className={"tm-historical-material"}><span>{row.material.trim() || <span className="tm-unnamed-material">{ko ? '이름 없는 원료' : 'UNNAMED MATERIAL'}</span>}{row.dilution?.enabled && <small className={"tm-dilution-suffix"}> @{row.dilution.percent}% in {row.dilution.solvent || 'ALC'}</small>}</span>{row.cas && <small className={"tm-cas-meta"}>CAS / REF. {row.cas}</small>}</div></div> : null)}</div><div className="tm-history-total"><div className="tm-section-label">{ko ? '합계' : 'TOTAL'} <strong>{totals.totalParts.toLocaleString()}</strong></div><dl><dt>{ko ? '배치' : 'Batch'}</dt><dd>{totals.batchWeightGrams.toFixed(2)} g</dd><dt>{ko ? '농축액' : 'Concentrate'}</dt><dd>{(totals.batchWeightGrams * totals.concentratePercent / 100).toFixed(2)} g ({totals.concentratePercent.toFixed(1)}%)</dd><dt>{ko ? '용매' : 'Solvent'}</dt><dd>{(totals.batchWeightGrams * totals.solventPercent / 100).toFixed(2)} g ({totals.solventPercent.toFixed(1)}%)</dd><dt>{ko ? '상태' : 'Status'}</dt><dd>{totals.complete ? (ko ? '완료' : 'Complete') : (ko ? '미완료' : 'Incomplete')}</dd></dl></div>{snapshot.notes && <div className="tm-history-notes"><div className="tm-section-label">{ko ? '노트' : 'NOTES'}</div><p>{snapshot.notes}</p></div>}</div> }

