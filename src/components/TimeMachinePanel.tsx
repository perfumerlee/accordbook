import { ScaleBatchView } from './ScaleBatchView'
import { useEffect, useRef, useState } from 'react'
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

export function formatVersionNote(version: FormulaVersion, language: 'en' | 'ko'): string {
  if (version.kind === 'restore-point' && language === 'ko') {
    const match = /^Before restoring (v\d+)$/i.exec(version.note.trim())
    if (match) return `복원 전 버전 : ${match[1]}`
  }
  return version.note
}

export default function TimeMachinePanel({ formula, storage, language, onClose, onBeforeSaveVersion, onRestore, isOpen }: { formula: Formula; storage: AccordbookStorage; language: 'en' | 'ko'; onClose: () => void; onBeforeSaveVersion?: () => Promise<void>; onRestore?: (formula: Formula) => Promise<void>; isOpen: boolean }) {
  const t = messages[language]
  const [batchOpen, setBatchOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const batchActionRef = useRef<HTMLButtonElement>(null)
  const batchBackRef = useRef<HTMLButtonElement>(null)
  const detailScroll = useRef(0)
  const openBatch = () => {
    detailScroll.current = contentRef.current?.scrollTop ?? 0
    setBatchOpen(true)
    window.requestAnimationFrame(() => { if (contentRef.current) contentRef.current.scrollTop = 0; batchBackRef.current?.focus({ preventScroll: true }) })
  }
  const backToVersion = () => {
    setBatchOpen(false)
    setActiveTab('version')
    window.requestAnimationFrame(() => { batchActionRef.current?.focus({ preventScroll: true }); if (contentRef.current) contentRef.current.scrollTop = detailScroll.current })
  }
  const formulaIdRef = useRef(formula.id); const [versions, setVersions] = useState<FormulaVersion[]>([]); const [compareTarget, setCompareTarget] = useState<FormulaVersion>(); const [activeTab, setActiveTab] = useState<TimeMachineTab>("version"); const [selected, setSelected] = useState<FormulaVersion>(); const [noteOpen, setNoteOpen] = useState(false); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [restoring, setRestoring] = useState(false); const [restoreConfirm, setRestoreConfirm] = useState(false); const [closing, setClosing] = useState(false); const [contextChanging, setContextChanging] = useState(false); const ko = language === 'ko'
  const reload = async () => setVersions(await listFormulaVersions(storage, formula.id)); const formulaContextChanged = formula.id !== formulaIdRef.current; useEffect(() => { formulaIdRef.current = formula.id; setSelected(undefined); setBatchOpen(false); setCompareTarget(undefined); setActiveTab("version"); setNoteOpen(false); setRestoreConfirm(false); setContextChanging(true); const timer = window.setTimeout(() => setContextChanging(false), 160); void reload(); return () => window.clearTimeout(timer) }, [formula.id])
  const save = async () => { setSaving(true); try { await onBeforeSaveVersion?.(); await createFormulaVersion(storage, formula, note); setNote(''); setNoteOpen(false); await reload() } finally { setSaving(false) } }
  useEffect(() => { if (isOpen) { setClosing(false); setBatchOpen(false); setActiveTab("version") } }, [isOpen]);
  useEffect(() => { if (!isOpen || !ko) return; document.querySelectorAll<HTMLElement>('.tm-header-meta').forEach((element) => { element.textContent = element.textContent?.replace(/(\d+) VERSIONS?/, (_, count) => `${count} 버전`) ?? element.textContent }) }, [isOpen, ko, versions.length])
  const requestClose = () => { if (closing) return; setClosing(true); window.setTimeout(onClose, 280) }; useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (isOpen && event.key === "Escape") requestClose() }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown) }, [closing, isOpen]); const date = (value: string) => new Date(value).toLocaleString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const restore = async () => { if (!selected || restoring) return; setRestoring(true); try { await onBeforeSaveVersion?.(); const restored = await restoreFormulaVersion(storage, formula, selected); await onRestore?.(restored); setRestoreConfirm(false); setSelected(undefined); setActiveTab("version"); await reload() } finally { setRestoring(false) } }
  const selectTab = (tab: TimeMachineTab) => {
    if (tab === 'compare') setCompareTarget(compareTarget ?? selected)
    setActiveTab(tab)
  }
  return <div className={`tm-backdrop ${closing ? 'is-closing' : ''}`}>
    <section className={'tm-panel ' + (selected ? 'tm-detail ' : '') + ((contextChanging || formulaContextChanged) ? 'tm-context-switch' : '')} role="dialog" aria-modal="true" aria-label="Time Machine">
      <header><div><h2>TIME MACHINE</h2><p className="tm-header-meta">{formula.formulaId} · {versions.filter(version => version.kind === 'manual').length} {ko ? '버전' : 'VERSIONS'}</p></div><button className="tm-close" type="button" aria-label={ko ? '닫기' : 'Close'} onClick={requestClose}>×</button></header>
      {!batchOpen && <div className="tm-view-tabs" role="tablist" aria-label="Time Machine">
        {TIME_MACHINE_TABS.map((tab, index) => <button key={tab} id={`tm-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`tm-view-${tab}`} tabIndex={activeTab === tab ? 0 : -1} className={activeTab === tab ? 'active' : ''} onClick={() => selectTab(tab)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % TIME_MACHINE_TABS.length : event.key === 'ArrowLeft' ? (index + TIME_MACHINE_TABS.length - 1) % TIME_MACHINE_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TIME_MACHINE_TABS.length - 1 : undefined
          if (next !== undefined) { event.preventDefault(); selectTab(TIME_MACHINE_TABS[next]); document.getElementById(`tm-tab-${TIME_MACHINE_TABS[next]}`)?.focus() }
        }}>{tab === 'version' ? (ko ? '버전' : 'VERSION') : (ko ? '비교' : 'COMPARE')}</button>)}
      </div>}
      <div className="tm-content" ref={contentRef}>
        <div id="tm-view-version" role="tabpanel" aria-labelledby="tm-tab-version" hidden={batchOpen || activeTab !== 'version'}>
          {selected ? <><button className="tm-version-list-back" type="button" onClick={() => setSelected(undefined)}>← {t.batchVersionList}</button><h2 className="tm-version-title">{selected.kind === 'manual' ? `v${selected.versionNumber}` : (ko ? '복원 지점' : 'RESTORE POINT')}</h2><div className="tm-version-meta"><span>{ko ? '읽기 전용' : 'READ ONLY'}</span><time>{date(selected.createdAt)}</time></div>{selected.note && <div className="tm-note"><span>{ko ? '버전 메모' : 'VERSION NOTE'}</span><p>{selected.note}</p></div>}{Array.isArray(selected.snapshot?.rows) ? <HistoricalFormula snapshot={selected.snapshot} language={language} /> : <p className="tm-batch-helper">{t.batchUnavailable}</p>}<div className="tm-restore-action">{restoreConfirm ? <div className="tm-restore-confirm" role="alertdialog" aria-label={ko ? '복원 확인' : 'Restore confirmation'}><strong>{ko ? `v${selected.versionNumber ?? ''}를 현재 포뮬러로 복원할까요?` : `Restore ${selected.kind === 'manual' ? `v${selected.versionNumber}` : 'this restore point'} to Current?`}</strong><p>{ko ? '현재 포뮬러의 내용이 이 버전으로 변경됩니다. 기존 버전 기록은 그대로 유지됩니다.' : 'The current formula will be replaced with this version. Your version history will be kept.'}</p><div><button className="btn" type="button" onClick={() => setRestoreConfirm(false)}>{ko ? '취소' : 'CANCEL'}</button><button className="btn primary" type="button" disabled={restoring} onClick={() => void restore()}>{restoring ? '…' : (ko ? '복원' : 'RESTORE')}</button></div></div> : <button className="tm-restore-button" type="button" onClick={() => setRestoreConfirm(true)}><svg className="tm-restore-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 5 11l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 11h7a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><span>{ko ? '이 버전 복원' : 'RESTORE THIS VERSION'}</span></button>}<button ref={batchActionRef} className="tm-restore-button tm-make-batch" type="button" onClick={openBatch}>{t.makeBatch}</button></div><button className="tm-detail-back" type="button" onClick={() => setSelected(undefined)}>← TIME MACHINE</button></> : <div className="tm-timeline"><div className="tm-current"><b>● {ko ? '현재' : 'CURRENT'}</b><span>{date(formula.updatedAt)}</span><small>{ko ? '편집 가능한 현재 Formula' : 'Current working formula'}</small></div><button className="tm-save" type="button" onClick={() => setNoteOpen(true)}>{ko ? '+ 버전 저장' : '+ SAVE VERSION'}</button>{noteOpen && <div className="tm-save-box"><label>{ko ? '버전 메모' : 'Version note'}<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={ko ? '실험 또는 시향 메모 (선택)' : 'Optional experiment or sensory note'} /></label><div><button className="btn" type="button" onClick={() => setNoteOpen(false)}>{ko ? '취소' : 'Cancel'}</button><button className="btn primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '…' : (ko ? '버전 저장' : 'Save Version')}</button></div></div>}{versions.length === 0 && <div className="tm-empty"><strong>{ko ? '저장된 버전이 없습니다.' : 'No saved versions yet.'}</strong><span>{ko ? '나중에 돌아올 수 있도록 의미 있는 Formula 단계를 저장하세요.' : 'Save a meaningful stage of your formula to return to it later.'}</span></div>}{[...versions].reverse().map((version) => <button className={`tm-item ${version.kind}`} key={version.versionId} type="button" onClick={() => { setSelected(version); setCompareTarget(undefined); setActiveTab("version") }}><b>{version.kind === 'manual' ? `○ v${version.versionNumber}` : `◇ ${ko ? '복원 지점' : 'RESTORE POINT'}`}</b><span>{date(version.createdAt)}</span>{version.note && <small>{formatVersionNote(version, language)}</small>}</button>)}</div>}
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

