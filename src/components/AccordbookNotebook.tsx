import { useEffect, useRef, useState } from 'react'
import '../rev30-preview/rev30.css'
import type { Formula, FormulaMaterial } from '../models/formula'
import { createStorage, type AccordbookStorage, type AutosaveStatus } from '../storage/storageService'
import { calculateFormulaTotals, calculatePercent } from '../services/formulaCalculator'
import { calculateDilution } from '../services/dilutionCalculator'
import { isSolventMaterial } from '../services/solventClassifier'
import { messages, type Language } from '../i18n/messages'
import { archiveFormula, createFormula, deleteArchivedFormula, duplicateFormula, resetMaterials, restoreFormula } from '../services/formulaLifecycle'
import { createBackup, downloadBackup } from '../services/exportJson'
import { BackupImportError, importBackup, parseBackup } from '../services/importJson'
import { printCurrentFormula } from '../services/printFormula'
import { trackBackupExported, trackDilutionApplied, trackFormulaCompleted, trackFormulaCreated, trackPrintOpened } from '../services/analytics'
import { downloadFormulaFile, FormulaFileError, importFormula, parseFormulaFile } from '../services/formulaFile'
import { appendRevision, contentFingerprint } from '../services/provenance'
import { ensureRowIds } from '../services/reconstruction'

const ACTIVE_KEY = 'accordbook.activeFormulaId'
const blankRow = (): FormulaMaterial => ({ id: crypto.randomUUID(), parts: '', material: '' })
const fmtDate = (v: string) => v.replace(/-/g, ' / ')

export default function AccordbookNotebook() {
  const [storage, setStorage] = useState<AccordbookStorage>(); const [formulas, setFormulas] = useState<Formula[]>([]); const [archive, setArchive] = useState<Formula[]>([]); const [active, setActive] = useState<Formula>(); const [status, setStatus] = useState<AutosaveStatus>('saved-locally'); const [prefix, setPrefix] = useState('ACC'); const [language, setLanguage] = useState<Language>('en'); const [archiveOpen, setArchiveOpen] = useState(false); const [deleteState, setDeleteState] = useState<Record<string, 'confirming' | 'ready'>>({}); const [exportOpen, setExportOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const formulaFileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Formula | undefined>(undefined); const provenancePending = useRef<Formula | undefined>(undefined); const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const provenanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const saveStartedAt = useRef<number>(0); const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { void (async () => { const s = await createStorage(); setStorage(s); setStatus(s.mode === 'indexeddb' ? 'saved-locally' : 'session-only'); const settings = await s.settings.get(); setPrefix(settings?.formulaIdPrefix ?? 'ACC'); setLanguage(settings?.language ?? 'en'); let list = await s.formulas.list(); if (!list.length) { const f = await createFormula(s, settings?.formulaIdPrefix ?? 'ACC'); await s.formulas.save(f); list = [f] } else { list = list.map(ensureRowIds); await Promise.all(list.map((f) => s.formulas.save(f))) } const saved = localStorage.getItem(ACTIVE_KEY); const selected = list.find((f) => f.id === saved) ?? list[0]; const archived = await s.archive.list(); setFormulas(list); setArchive(archived); setArchiveOpen(archived.length > 0); setActive(selected); localStorage.setItem(ACTIVE_KEY, selected.id) })() }, [])
  const persist = async (value: Formula) => { if (!storage) return; if (debounceTimer.current) clearTimeout(debounceTimer.current); pending.current = undefined; setStatus('saving'); saveStartedAt.current = Date.now(); const result = await storage.saveFormula(value); const remaining = Math.max(0, 200 - (Date.now() - saveStartedAt.current)); if (statusTimer.current) clearTimeout(statusTimer.current); statusTimer.current = setTimeout(() => setStatus(result), remaining) }
  const flush = () => { const value = pending.current; if (value) void persist(value) }
  const schedule = (value: Formula) => { pending.current = value; if (debounceTimer.current) clearTimeout(debounceTimer.current); debounceTimer.current = setTimeout(() => { debounceTimer.current = undefined; void persist(value) }, 250) }
  useEffect(() => { const onVisibility = () => { if (document.visibilityState !== 'visible') { flush(); void flushProvenance() } }; document.addEventListener('visibilitychange', onVisibility); return () => { document.removeEventListener('visibilitychange', onVisibility); flush(); void flushProvenance(); if (debounceTimer.current) clearTimeout(debounceTimer.current); if (provenanceTimer.current) clearTimeout(provenanceTimer.current); if (statusTimer.current) clearTimeout(statusTimer.current) } }, [storage])
  useEffect(() => { const closeMenus = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.export-wrap')) { setExportOpen(false); setImportOpen(false) } }; document.addEventListener('click', closeMenus); return () => document.removeEventListener('click', closeMenus) }, [])
  const select = async (f: Formula) => { await flushProvenance(); flush(); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const flushProvenance = async () => { const value = provenancePending.current; if (!value) return value; provenancePending.current = undefined; if (provenanceTimer.current) clearTimeout(provenanceTimer.current); const fingerprint = await contentFingerprint(value); if (value.provenance?.currentFingerprint === fingerprint) return value; const revised = await appendRevision(value, 'modified'); setActive((current) => current?.id === revised.id ? revised : current); setFormulas((all) => all.map((f) => f.id === revised.id ? revised : f)); await persist(revised); return revised }
  const scheduleProvenance = (value: Formula) => { provenancePending.current = value; if (provenanceTimer.current) clearTimeout(provenanceTimer.current); provenanceTimer.current = setTimeout(() => { provenanceTimer.current = undefined; void flushProvenance() }, 1800) }
  const save = (next: Formula) => { if (active && calculateFormulaTotals(active.rows).totalParts !== 1000 && calculateFormulaTotals(next.rows).totalParts === 1000) trackFormulaCompleted(next.id); setActive(next); setFormulas((all) => all.map((f) => f.id === next.id ? next : f)); schedule(next); scheduleProvenance(next) }
  const update = (changes: Partial<Formula>) => { if (active) save({ ...active, ...changes, updatedAt: new Date().toISOString() }) }
  const createNew = async () => { if (!storage) return; await flushProvenance(); flush(); const f = await createFormula(storage, prefix); await storage.formulas.save(f); trackFormulaCreated('new'); setFormulas((all) => [...all, f]); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const duplicate = async () => { if (!storage || !active) return; await flushProvenance(); flush(); const f = await duplicateFormula(storage, active, prefix); trackFormulaCreated('duplicate'); setFormulas((all) => [...all, f]); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const reset = () => { if (active && window.confirm(language === 'ko' ? '원료 행만 초기화됩니다. 포뮬러 ID, 제목, 날짜, 노트는 유지됩니다.' : 'Material rows only will be reset. Formula ID, title, date, and notes will be kept.')) update(resetMaterials(active)) }
  const moveArchive = async () => { if (!storage || !active) return; flush(); await archiveFormula(storage, active); let next = formulas.find((f) => f.id !== active.id); let nextList = formulas.filter((f) => f.id !== active.id); if (!next) { next = await createFormula(storage, prefix); await storage.formulas.save(next); nextList = [...nextList, next] } setFormulas(nextList); setArchive(await storage.archive.list()); setActive(next); setArchiveOpen(true); localStorage.setItem(ACTIVE_KEY, next.id) }
  const restoreItem = async (f: Formula) => { if (!storage) return; await restoreFormula(storage, f); setArchive(await storage.archive.list()); setFormulas(await storage.formulas.list()) }
  const removeArchive = async (f: Formula) => { if (!storage) return; await deleteArchivedFormula(storage, f.id); setArchive(await storage.archive.list()); setDeleteState((all) => { const next = { ...all }; delete next[f.id]; return next }) }
  const beginDelete = (f: Formula) => { if (deleteState[f.id]) return; setDeleteState((s) => ({ ...s, [f.id]: 'confirming' })); setTimeout(() => setDeleteState((s) => ({ ...s, [f.id]: 'ready' })), 3500) }
  const exportJson = async () => { if (!storage) return; flush(); const backup = await createBackup(storage); downloadBackup(backup); trackBackupExported() }
  const exportFormula = async () => { if (active) { const latest = await flushProvenance() ?? active; const exported = await appendRevision(latest, 'exported'); setActive(exported); setFormulas((all) => all.map((f) => f.id === exported.id ? exported : f)); await persist(exported); await downloadFormulaFile(exported) } }
  const importFormulaFile = async (file: File) => { if (!storage) return; try { const shared = parseFormulaFile(await file.text()); const imported = await importFormula(storage, shared, prefix); setFormulas((all) => [...all, imported]); setActive(imported); localStorage.setItem(ACTIVE_KEY, imported.id); trackFormulaCreated('import') } catch (error) { if (error instanceof FormulaFileError) window.alert(error.message) } }
  const importJson = async (file: File) => { if (!storage) return; try { const backup = parseBackup(await file.text()); if (!window.confirm(language === 'ko' ? '이 백업을 가져오면 현재 노트북의 데이터가 대체됩니다.' : 'Importing this backup will replace the current notebook.')) return; await importBackup(storage, backup); const settings = await storage.settings.get(); const list = await storage.formulas.list(); setPrefix(settings?.formulaIdPrefix ?? 'ACC'); setLanguage(settings?.language ?? 'en'); setFormulas(list); setArchive(await storage.archive.list()); const saved = localStorage.getItem(ACTIVE_KEY); const selected = list.find((f) => f.id === saved) ?? list[0]; setActive(selected); if (selected) localStorage.setItem(ACTIVE_KEY, selected.id) } catch (error) { if (error instanceof BackupImportError) window.alert(error.message); else window.alert(language === 'ko' ? '가져오기에 실패했습니다.' : 'Import failed.') } }
  const print = () => { flush(); if (printCurrentFormula()) trackPrintOpened() }
  if (!storage || !active) return <main className="loading-shell">Opening notebook…</main>
  const t = { ...messages[language], export: language === 'ko' ? '내보내기' : 'Export', importLabel: language === 'ko' ? '가져오기' : 'Import', jsonBackup: language === 'ko' ? '노트북 백업' : 'Backup notebook', importBackup: language === 'ko' ? '백업 복원' : 'Restore backup', exportFormula: language === 'ko' ? '현재 포뮬러 내보내기' : 'Export current formula', importFormula: language === 'ko' ? '포뮬러 가져오기' : 'Import formula', printLabel: language === 'ko' ? '현재 포뮬러 인쇄' : 'Print current formula', formulaTitle: language === 'ko' ? '포뮬러 / 어코드 제목' : 'Formula / Accord title', add: messages[language].addMaterial, duplicate: language === "ko" ? "새 포뮬러로 복제" : "Duplicate as new page", reset: language === "ko" ? "원료 초기화" : "Reset materials", move: language === "ko" ? "보관함으로 이동" : "Move to Archive" }
  const totals = calculateFormulaTotals(active.rows)
  return <div className="app"><aside className="sidebar"><div className="brand">Accordbook</div><div className="brand-sub">{t.appTagline}</div><div className="side-title">{t.prefix}</div><div className="prefix-row"><input maxLength={12} value={prefix} aria-label={t.prefix} onChange={(e) => setPrefix(e.target.value)} /><button className="btn prefix-save-btn" type="button" onClick={() => void storage.settings.save({ formulaIdPrefix: prefix.trim().toUpperCase() || "ACC", language })}>{t.save}</button></div><button className="btn primary new-btn" type="button" onClick={() => void createNew()}>{t.newFormula}</button><div className="side-title">{t.notebook}</div><div className="formula-list">{formulas.map((f) => <button className={`formula-item ${f.id === active.id ? 'active' : ''}`} type="button" key={f.id} onClick={() => select(f)}><div className="formula-code">{f.formulaId}</div><div className="formula-label">{f.name || t.untitled}</div></button>)}</div><div className="side-title">{t.data}</div><div className="data-actions"><div className="export-wrap"><button className="btn" type="button" onClick={() => { setImportOpen(false); setExportOpen((v) => !v) }}>{t.export} ▾</button>{exportOpen && <div className="export-menu open"><button className="btn" type="button" onClick={() => { setExportOpen(false); exportFormula() }}>{t.exportFormula}</button><button className="btn" type="button" onClick={() => { setExportOpen(false); void exportJson() }}>{t.jsonBackup}</button><button className="btn" type="button" onClick={() => { setExportOpen(false); print() }}>{t.printLabel}</button></div>}</div><div className="export-wrap"><button className="btn" type="button" onClick={() => { setExportOpen(false); setImportOpen((v) => !v) }}>{t.importLabel} ▾</button>{importOpen && <div className="export-menu open"><button className="btn" type="button" onClick={() => formulaFileRef.current?.click()}>{t.importFormula}</button><button className="btn" type="button" onClick={() => fileRef.current?.click()}>{t.importBackup}</button></div>}</div><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const file=e.target.files?.[0]; if (file) void importJson(file); e.currentTarget.value="" }} /><input ref={formulaFileRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const file=e.target.files?.[0]; if (file) void importFormulaFile(file); e.currentTarget.value="" }} /></div><button className="btn archive-toggle" type="button" onClick={() => setArchiveOpen((v) => !v)}>{t.archive}<span className="archive-count">{archive.length}</span></button>{archiveOpen && <div className="archive-panel open">{archive.map((f) => <div className="archive-item" key={f.id}><div className="formula-code">{f.formulaId}</div><div className="formula-label">{f.name || t.untitled}</div><div className="archive-item-actions"><button className="btn" type="button" onClick={() => void restoreItem(f)}>{t.restore}</button><button className={`btn danger ${deleteState[f.id] || ""}`} type="button" onClick={() => deleteState[f.id] === "ready" ? void removeArchive(f) : beginDelete(f)}>{deleteState[f.id] === "confirming" ? t.confirmDelete : deleteState[f.id] === "ready" ? t.deleteNow : t.deletePermanently}</button></div></div>)}</div>}<div className="privacy"><strong>{t.privateByDefault}</strong><br />{t.localOnly}<br />VERSION v1.02</div></aside><main className="main"><section className="notebook"><header className="note-header"><div className="title-area"><div className="title-primary"><label>{t.formulaTitle}</label><input className="formula-name" value={active.name} placeholder={t.untitled} onChange={(e) => update({ name: e.target.value })} /></div><div className="title-hint">1,000 parts = 10.00 g · 1 part = 0.01 g</div></div><div><div className="page-box"><div className="page-key">{t.formulaId}</div><div className="page-value">{active.formulaId}</div><div className="page-key">{t.date}</div><div className="page-value">{fmtDate(active.date)}</div></div><div className="header-tools"><div className={`autosave-status ${status}`}><span className="autosave-dot" /><span>{status === 'saving' ? t.saving : status === 'session-only' ? t.sessionOnly : t.savedLocally}</span></div><div className="language-toggle"><button className={`lang-btn ${language === "en" ? "active" : ""}`} type="button" onClick={() => { setLanguage("en"); void storage.settings.save({ formulaIdPrefix: prefix, language: "en" }) }}><svg className="flag-svg" viewBox="0 0 7410 3900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0 0h7410v3900H0" fill="#b31942" />
      <path d="M0 450h7410m0 600H0m0 600h7410m0 600H0m0 600h7410m0 600H0" stroke="#fff" strokeWidth="300" />
      <path d="M0 0h2964v2100H0" fill="#0a3161" />
      <defs>
        <path id="us-star" d="M247 90 317.534 307.082 132.873 172.918H361.127L176.466 307.082z" />
      </defs>
      <g fill="#fff">
        <g id="rowA">
          <use href="#us-star" x="0" y="0" /><use href="#us-star" x="494" y="0" /><use href="#us-star" x="988" y="0" />
          <use href="#us-star" x="1482" y="0" /><use href="#us-star" x="1976" y="0" /><use href="#us-star" x="2470" y="0" />
        </g>
        <g id="rowB">
          <use href="#us-star" x="247" y="210" /><use href="#us-star" x="741" y="210" /><use href="#us-star" x="1235" y="210" />
          <use href="#us-star" x="1729" y="210" /><use href="#us-star" x="2223" y="210" />
        </g>
        <use href="#rowA" y="420" /><use href="#rowB" y="420" />
        <use href="#rowA" y="840" /><use href="#rowB" y="840" />
        <use href="#rowA" y="1260" /><use href="#rowB" y="1260" />
        <use href="#rowA" y="1680" />
      </g>
    </svg></button><button className={`lang-btn ${language === "ko" ? "active" : ""}`} type="button" onClick={() => { setLanguage("ko"); void storage.settings.save({ formulaIdPrefix: prefix, language: "ko" }) }}><svg className="flag-svg" viewBox="-72 -48 144 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#fff" d="M-72-48v96H72v-96z" />
      <g stroke="#000" strokeWidth="4">
        <path
          transform="rotate(33.69006752598)"
          d="M-50-12v24m6 0v-24m6 0v24m76 0V1m0-2v-11m6 0v11m0 2v11m6 0V1m0-2v-11"
        />
        <path
          transform="rotate(-33.69006752598)"
          d="M-50-12v24m6 0V1m0-2v-11m6 0v24m76 0V1m0-2v-11m6 0v24m6 0V1m0-2v-11"
        />
      </g>
      <g transform="rotate(33.69006752598)">
        <path fill="#cd2e3a" d="M12 0a18 18 0 11-36 0 24 24 0 1148 0" />
        <path fill="#0047a0" d="M0 0a12 12 0 1124 0 24 24 0 11-48 0 12 12 0 1024 0" />
      </g>
    </svg></button></div></div></div></header><div className="content"><div className="table-head"><div style={{ textAlign: "center" }}>{t.parts}</div><div>{t.material}</div><div>{t.cas}</div><div style={{ textAlign: "right" }}>{t.percent}</div><div /></div><div className="rows">{active.rows.map((row) => <Row key={row.id} row={row} t={t} onChange={(changes) => update({ rows: active.rows.map((r) => r.id === row.id ? { ...r, ...changes } : r) })} onRemove={() => update({ rows: active.rows.length === 1 ? [blankRow()] : active.rows.filter((r) => r.id !== row.id) })} />)}</div><div className="editor-actions"><button className="btn primary" type="button" onClick={() => update({ rows: [...active.rows, blankRow()] })}>{t.add}</button><button className="btn" type="button" onClick={() => void duplicate()}>{t.duplicate}</button><button className="btn" type="button" onClick={reset}>{t.reset}</button><button className="btn" type="button" onClick={() => void moveArchive()}>{t.move}</button></div><div className="summary-grid"><div><div className="notes-title">{t.notes}</div><textarea className="notes" placeholder={t.labNotes} value={active.notes} onChange={(e) => update({ notes: e.target.value })} /></div><div className="metrics"><div className="summary-title">{t.total}</div><div className="simple-total"><div className="main-line"><span>{t.formula}</span><strong>{totals.totalParts.toLocaleString()} / 1,000</strong></div><div className="sub-line"><span>{t.batch} <strong>{totals.batchWeightGrams.toFixed(2)} g</strong></span><span>{t.concentrate} <strong>{totals.concentratePercent.toFixed(2)}%</strong></span><span>{t.solvent} <strong>{totals.solventPercent.toFixed(2)}% · {(totals.batchWeightGrams * totals.solventPercent / 100).toFixed(2)} g</strong></span></div><div className={totals.complete ? "status ok" : "status bad"}>{totals.complete ? t.complete : totals.differenceParts > 0 ? t.addParts(totals.differenceParts) : t.reduceParts(Math.abs(totals.differenceParts))}</div></div></div></div></div><footer className="note-footer"><span>{t.footer}</span><span>{active.formulaId}</span></footer></section></main></div>
}

function Row({ row, onChange, onRemove, t }: { row: FormulaMaterial; onChange: (changes: Partial<FormulaMaterial>) => void; onRemove: () => void; t: { strength: string; solventCarrier: string; total: string; solvent: string; removeDilution: string } }) {
  const [open, setOpen] = useState(false)
  const dilution = row.dilution
  const notation = dilution?.enabled ? `@${dilution.percent}% in ${dilution.solvent || 'ALC'}` : ''
  const setDilution = (changes: Partial<NonNullable<FormulaMaterial['dilution']>>) => { if (!dilution) trackDilutionApplied(); onChange({ dilution: { enabled: true, percent: 10, solvent: 'ALC', ...dilution, ...changes } }) }
  return <>
    <div className={`row ${row.marked ? 'marked' : ''}`}><input className="parts" type="number" step="1" min="0" placeholder=" " value={row.parts} onChange={(e) => onChange({ parts: e.target.value === '' ? '' : Math.max(0, Math.trunc(Number(e.target.value))) })} /><div className="material-wrap"><input className="material" placeholder=" " value={row.material} onChange={(e) => onChange({ material: e.target.value })} /><div className="material-meta">{notation && <span className="dilution-suffix">{notation}</span>}{isSolventMaterial(row.material) && <span className="solvent-badge">SOLVENT</span>}</div></div><input className="cas" placeholder=" " value={row.cas ?? ''} onChange={(e) => onChange({ cas: e.target.value })} /><div className="percent">{calculatePercent(row.parts).toFixed(1)}%</div><div className="row-actions"><button className={`dilution-btn ${dilution ? 'active' : ''}`} type="button" onClick={() => { if (!dilution) setDilution({}); setOpen((value) => !value) }}>DIL</button><button className={`mark-btn ${row.marked ? 'active' : ''}`} type="button" onClick={() => onChange({ marked: !row.marked })}>▰</button><button className="remove-btn" type="button" onClick={onRemove}>×</button></div></div>
    {open && dilution && <div className="dilution-panel"><div><label>{t.strength}</label><input type="number" min="0" max="100" step="1" value={dilution.percent} onChange={(e) => setDilution({ percent: Number(e.target.value) })} /></div><div><label>{t.solventCarrier}</label><input value={dilution.solvent} onChange={(e) => setDilution({ solvent: e.target.value })} /></div><div><label>Total</label><div className="dilution-result"><strong>{calculateDilution(row).solutionGrams.toFixed(2)} g</strong> · {t.solvent} {calculateDilution(row).solventGrams.toFixed(2)} g</div><button className="btn" type="button" onClick={() => { onChange({ dilution: undefined }); setOpen(false) }}>{t.removeDilution}</button></div></div>}
  </>
}

















