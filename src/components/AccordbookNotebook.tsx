import { useEffect, useRef, useState } from 'react'
import '../rev30-preview/rev30.css'
import type { Formula, FormulaMaterial } from '../models/formula'
import type { IfraDataset } from '../models/ifra'
import type { NaturalContributionDataset } from '../models/naturalContribution'
import { IFRA_CATEGORY_DEFINITIONS } from '../data/ifraCategoryDefinitions'
import { parseNaturalContributionCsv } from '../services/naturalContributionCsvParser'
import bundledIfraDatabaseCsv from '../data/ifra-database.csv?raw'
import bundledNaturalContributionsCsv from '../data/ifra-natural-contributions.csv?raw'
import { createStorage, type AccordbookStorage, type AutosaveStatus } from '../storage/storageService'
import { calculateFormulaTotals, calculatePercent } from '../services/formulaCalculator'
import { calculateDilution } from '../services/dilutionCalculator'
import { isSolventMaterial } from '../services/solventClassifier'
import { parseIfraCsv } from '../services/ifraCsvParser'
import { calculateAllergenLabeling, calculateMaxUsagePercent, matchIfraMaterial, type AllergenLabelingResult, type MaxUsageResult, type ProductType } from '../services/ifraScreening'
import { messages, type Language } from '../i18n/messages'
import { archiveFormula, createFormula, deleteArchivedFormula, duplicateFormula, resetMaterials, restoreFormula } from '../services/formulaLifecycle'
import { createBackup, downloadBackup } from '../services/exportJson'
import { BackupImportError, importBackup, parseBackup } from '../services/importJson'
import { printCurrentFormula } from '../services/printFormula'
import { trackBackupExported, trackDilutionApplied, trackFormulaCompleted, trackFormulaCreated, trackPrintOpened } from '../services/analytics'
import { downloadFormulaFile, FormulaFileError, importFormula, parseFormulaFile } from '../services/formulaFile'

const ACTIVE_KEY = 'accordbook.activeFormulaId'
const blankRow = (): FormulaMaterial => ({ id: crypto.randomUUID(), parts: '', material: '' })
const fmtDate = (v: string) => v.replace(/-/g, ' / ')

// First-run only: if this browser has never imported IFRA/natural-contribution data,
// seed it from the bundled CSVs so the screening feature works out of the box. Never
// overwrites data the user already imported (their own file always wins).
async function loadOrSeedIfraData(storage: AccordbookStorage): Promise<{ ifra: IfraDataset; naturalContributions: NaturalContributionDataset }> {
  let ifra = await storage.ifra.get()
  if (!ifra) { ifra = parseIfraCsv(bundledIfraDatabaseCsv).dataset; await storage.ifra.save(ifra) }
  let naturalContributions = await storage.naturalContributions.get()
  if (!naturalContributions) { naturalContributions = parseNaturalContributionCsv(bundledNaturalContributionsCsv).dataset; await storage.naturalContributions.save(naturalContributions) }
  return { ifra, naturalContributions }
}

export default function AccordbookNotebook() {
  const [storage, setStorage] = useState<AccordbookStorage>(); const [formulas, setFormulas] = useState<Formula[]>([]); const [archive, setArchive] = useState<Formula[]>([]); const [active, setActive] = useState<Formula>(); const [status, setStatus] = useState<AutosaveStatus>('saved-locally'); const [prefix, setPrefix] = useState('ACC'); const [language, setLanguage] = useState<Language>('en'); const [archiveOpen, setArchiveOpen] = useState(false); const [deleteState, setDeleteState] = useState<Record<string, 'confirming' | 'ready'>>({}); const [exportOpen, setExportOpen] = useState(false); const [importOpen, setImportOpen] = useState(false); const fileRef = useRef<HTMLInputElement>(null); const formulaFileRef = useRef<HTMLInputElement>(null)
  const [ifraDataset, setIfraDataset] = useState<IfraDataset>(); const [naturalContributionDataset, setNaturalContributionDataset] = useState<NaturalContributionDataset>(); const [primaryCategoryKey, setPrimaryCategoryKey] = useState(''); const [secondaryCategoryKey, setSecondaryCategoryKey] = useState(''); const [categoryHelpOpen, setCategoryHelpOpen] = useState(false); const ifraFileRef = useRef<HTMLInputElement>(null); const naturalContributionFileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<Formula | undefined>(undefined); const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const saveStartedAt = useRef<number>(0); const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => { void (async () => { const s = await createStorage(); setStorage(s); setStatus(s.mode === 'indexeddb' ? 'saved-locally' : 'session-only'); const settings = await s.settings.get(); setPrefix(settings?.formulaIdPrefix ?? 'ACC'); setLanguage(settings?.language ?? 'en'); setPrimaryCategoryKey(settings?.primaryCategoryKey ?? ''); setSecondaryCategoryKey(settings?.secondaryCategoryKey ?? ''); const seeded = await loadOrSeedIfraData(s); setIfraDataset(seeded.ifra); setNaturalContributionDataset(seeded.naturalContributions); let list = await s.formulas.list(); if (!list.length) { const f = await createFormula(s, settings?.formulaIdPrefix ?? 'ACC'); await s.formulas.save(f); list = [f] } const saved = localStorage.getItem(ACTIVE_KEY); const selected = list.find((f) => f.id === saved) ?? list[0]; const archived = await s.archive.list(); setFormulas(list); setArchive(archived); setArchiveOpen(archived.length > 0); setActive(selected); localStorage.setItem(ACTIVE_KEY, selected.id) })() }, [])
  const persist = async (value: Formula) => { if (!storage) return; if (debounceTimer.current) clearTimeout(debounceTimer.current); pending.current = undefined; setStatus('saving'); saveStartedAt.current = Date.now(); const result = await storage.saveFormula(value); const remaining = Math.max(0, 200 - (Date.now() - saveStartedAt.current)); if (statusTimer.current) clearTimeout(statusTimer.current); statusTimer.current = setTimeout(() => setStatus(result), remaining) }
  const flush = () => { const value = pending.current; if (value) void persist(value) }
  const schedule = (value: Formula) => { pending.current = value; if (debounceTimer.current) clearTimeout(debounceTimer.current); debounceTimer.current = setTimeout(() => { debounceTimer.current = undefined; void persist(value) }, 250) }
  useEffect(() => { const onVisibility = () => { if (document.visibilityState !== 'visible') flush() }; document.addEventListener('visibilitychange', onVisibility); return () => { document.removeEventListener('visibilitychange', onVisibility); flush(); if (debounceTimer.current) clearTimeout(debounceTimer.current); if (statusTimer.current) clearTimeout(statusTimer.current) } }, [storage])
  useEffect(() => { const closeMenus = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('.export-wrap')) { setExportOpen(false); setImportOpen(false) } }; document.addEventListener('click', closeMenus); return () => document.removeEventListener('click', closeMenus) }, [])
  const select = (f: Formula) => { flush(); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const save = (next: Formula) => { if (active && calculateFormulaTotals(active.rows).totalParts !== 1000 && calculateFormulaTotals(next.rows).totalParts === 1000) trackFormulaCompleted(next.id); setActive(next); setFormulas((all) => all.map((f) => f.id === next.id ? next : f)); schedule(next) }
  const update = (changes: Partial<Formula>) => { if (active) save({ ...active, ...changes, updatedAt: new Date().toISOString() }) }
  const createNew = async () => { if (!storage) return; flush(); const f = await createFormula(storage, prefix); await storage.formulas.save(f); trackFormulaCreated('new'); setFormulas((all) => [...all, f]); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const duplicate = async () => { if (!storage || !active) return; flush(); const f = await duplicateFormula(storage, active, prefix); trackFormulaCreated('duplicate'); setFormulas((all) => [...all, f]); setActive(f); localStorage.setItem(ACTIVE_KEY, f.id) }
  const reset = () => { if (active && window.confirm(language === 'ko' ? '원료 행만 초기화됩니다. 포뮬러 ID, 제목, 날짜, 노트는 유지됩니다.' : 'Material rows only will be reset. Formula ID, title, date, and notes will be kept.')) update(resetMaterials(active)) }
  const moveArchive = async () => { if (!storage || !active) return; flush(); await archiveFormula(storage, active); let next = formulas.find((f) => f.id !== active.id); let nextList = formulas.filter((f) => f.id !== active.id); if (!next) { next = await createFormula(storage, prefix); await storage.formulas.save(next); nextList = [...nextList, next] } setFormulas(nextList); setArchive(await storage.archive.list()); setActive(next); setArchiveOpen(true); localStorage.setItem(ACTIVE_KEY, next.id) }
  const restoreItem = async (f: Formula) => { if (!storage) return; await restoreFormula(storage, f); setArchive(await storage.archive.list()); setFormulas(await storage.formulas.list()) }
  const removeArchive = async (f: Formula) => { if (!storage) return; await deleteArchivedFormula(storage, f.id); setArchive(await storage.archive.list()); setDeleteState((all) => { const next = { ...all }; delete next[f.id]; return next }) }
  const beginDelete = (f: Formula) => { if (deleteState[f.id]) return; setDeleteState((s) => ({ ...s, [f.id]: 'confirming' })); setTimeout(() => setDeleteState((s) => ({ ...s, [f.id]: 'ready' })), 3500) }
  const exportJson = async () => { if (!storage) return; flush(); const backup = await createBackup(storage); downloadBackup(backup); trackBackupExported() }
  const exportFormula = () => { if (active) downloadFormulaFile(active) }
  const importFormulaFile = async (file: File) => { if (!storage) return; try { const shared = parseFormulaFile(await file.text()); const imported = await importFormula(storage, shared, prefix); setFormulas((all) => [...all, imported]); setActive(imported); localStorage.setItem(ACTIVE_KEY, imported.id); trackFormulaCreated('import') } catch (error) { if (error instanceof FormulaFileError) window.alert(error.message) } }
  const importJson = async (file: File) => { if (!storage) return; try { const backup = parseBackup(await file.text()); if (!window.confirm(language === 'ko' ? '이 백업을 가져오면 현재 노트북의 데이터가 대체됩니다.' : 'Importing this backup will replace the current notebook.')) return; await importBackup(storage, backup); const settings = await storage.settings.get(); const list = await storage.formulas.list(); setPrefix(settings?.formulaIdPrefix ?? 'ACC'); setLanguage(settings?.language ?? 'en'); setPrimaryCategoryKey(settings?.primaryCategoryKey ?? ''); setSecondaryCategoryKey(settings?.secondaryCategoryKey ?? ''); setIfraDataset(await storage.ifra.get()); setNaturalContributionDataset(await storage.naturalContributions.get()); setFormulas(list); setArchive(await storage.archive.list()); const saved = localStorage.getItem(ACTIVE_KEY); const selected = list.find((f) => f.id === saved) ?? list[0]; setActive(selected); if (selected) localStorage.setItem(ACTIVE_KEY, selected.id) } catch (error) { if (error instanceof BackupImportError) window.alert(error.message); else window.alert(language === 'ko' ? '가져오기에 실패했습니다.' : 'Import failed.') } }
  const importIfraCsv = async (file: File) => { if (!storage) return; try { const text = await file.text(); const { dataset, skippedRows } = parseIfraCsv(text); await storage.ifra.save(dataset); setIfraDataset(dataset); window.alert(messages[language].ifraImportSummary(dataset.materials.length, skippedRows)) } catch { window.alert(messages[language].ifraImportFailed) } }
  const importNaturalContributionCsv = async (file: File) => { if (!storage) return; try { const text = await file.text(); const { dataset, skippedRows } = parseNaturalContributionCsv(text); await storage.naturalContributions.save(dataset); setNaturalContributionDataset(dataset); window.alert(messages[language].ifraNaturalImportSummary(dataset.entries.length, skippedRows)) } catch { window.alert(messages[language].ifraImportFailed) } }
  const saveIfraSettings = (changes: { primaryCategoryKey?: string; secondaryCategoryKey?: string }) => {
    if (!storage) return
    const next = { primaryCategoryKey, secondaryCategoryKey, ...changes }
    setPrimaryCategoryKey(next.primaryCategoryKey); setSecondaryCategoryKey(next.secondaryCategoryKey)
    void storage.settings.save({ formulaIdPrefix: prefix, language, ...next })
  }
  const print = () => { flush(); if (printCurrentFormula()) trackPrintOpened() }
  if (!storage || !active) return <main className="loading-shell">Opening notebook…</main>
  const t = { ...messages[language], export: language === 'ko' ? '내보내기' : 'Export', importLabel: language === 'ko' ? '가져오기' : 'Import', jsonBackup: language === 'ko' ? '노트북 백업' : 'Backup notebook', importBackup: language === 'ko' ? '백업 복원' : 'Restore backup', exportFormula: language === 'ko' ? '현재 포뮬러 내보내기' : 'Export current formula', importFormula: language === 'ko' ? '포뮬러 가져오기' : 'Import formula', printLabel: language === 'ko' ? '현재 포뮬러 인쇄' : 'Print current formula', formulaTitle: language === 'ko' ? '포뮬러 / 어코드 제목' : 'Formula / Accord title', add: messages[language].addMaterial, duplicate: language === "ko" ? "새 포뮬러로 복제" : "Duplicate as new page", reset: language === "ko" ? "원료 초기화" : "Reset materials", move: language === "ko" ? "보관함으로 이동" : "Move to Archive" }
  const totals = calculateFormulaTotals(active.rows)
  const primaryUsage: MaxUsageResult | undefined = ifraDataset && primaryCategoryKey ? calculateMaxUsagePercent(active.rows, ifraDataset.materials, primaryCategoryKey) : undefined
  const secondaryUsage: MaxUsageResult | undefined = ifraDataset && secondaryCategoryKey ? calculateMaxUsagePercent(active.rows, ifraDataset.materials, secondaryCategoryKey) : undefined
  const intendedUsagePercent = typeof active.intendedUsagePercent === 'number' ? active.intendedUsagePercent : null
  const intendedProductType: ProductType = active.intendedProductType ?? 'leave-on'
  const naturalContributionEntries = naturalContributionDataset?.entries ?? []
  const allergens26: AllergenLabelingResult | undefined = ifraDataset ? calculateAllergenLabeling(active.rows, ifraDataset.materials, naturalContributionEntries, intendedUsagePercent, intendedProductType, 'allergen26') : undefined
  const allergens83: AllergenLabelingResult | undefined = ifraDataset ? calculateAllergenLabeling(active.rows, ifraDataset.materials, naturalContributionEntries, intendedUsagePercent, intendedProductType, 'allergen83') : undefined
  const materialName = (rowId?: string) => rowId ? (active.rows.find((r) => r.id === rowId)?.material || t.untitled) : ''
  const productTypeLabel = (productType: ProductType) => productType === 'leave-on' ? t.ifraLeaveOn : t.ifraRinseOff
  const categoryOptionLabel = (key: string) => { const def = IFRA_CATEGORY_DEFINITIONS[key]; return def ? `${key} — ${def[language]}` : key }
  const limitComplianceNote = (usage: MaxUsageResult | undefined) => {
    if (intendedUsagePercent === null || usage?.max == null) return null
    return <div className={`ifra-summary-note ${intendedUsagePercent > usage.max ? 'warn' : ''}`}>{intendedUsagePercent > usage.max ? t.ifraExceedsLimit(intendedUsagePercent) : t.ifraWithinLimit(intendedUsagePercent)}</div>
  }
  const allergenSummary = (result?: AllergenLabelingResult) => {
    if (!result) return null
    return <>
      {result.required.map((substance) => <div key={substance.name} className="ifra-summary-note warn">
        {t.ifraAllergenRequired(substance.name)}
        {substance.naturalConcentration > 0 && <> · {t.ifraNaturalContributionNote((substance.naturalConcentration / substance.totalConcentration) * 100)}</>}
      </div>)}
      {result.required.length === 0 && result.undetermined.length === 0 && <div className="ifra-summary-note">{t.ifraAllergenNone}</div>}
      {result.undetermined.length > 0 && <div className="ifra-summary-note">{t.ifraAllergenUndetermined(result.undetermined.map((entry) => entry.name).join(', '))}</div>}
    </>
  }
  return <div className="app"><aside className="sidebar"><div className="brand">Accordbook</div><div className="brand-sub">{t.appTagline}</div><div className="side-title">{t.prefix}</div><div className="prefix-row"><input maxLength={12} value={prefix} aria-label={t.prefix} onChange={(e) => setPrefix(e.target.value)} /><button className="btn prefix-save-btn" type="button" onClick={() => void storage.settings.save({ formulaIdPrefix: prefix.trim().toUpperCase() || "ACC", language })}>{t.save}</button></div><button className="btn primary new-btn" type="button" onClick={() => void createNew()}>{t.newFormula}</button><div className="side-title">{t.notebook}</div><div className="formula-list">{formulas.map((f) => <button className={`formula-item ${f.id === active.id ? 'active' : ''}`} type="button" key={f.id} onClick={() => select(f)}><div className="formula-code">{f.formulaId}</div><div className="formula-label">{f.name || t.untitled}</div></button>)}</div><div className="side-title">{t.data}</div><div className="data-actions"><div className="export-wrap"><button className="btn" type="button" onClick={() => { setImportOpen(false); setExportOpen((v) => !v) }}>{t.export} ▾</button>{exportOpen && <div className="export-menu open"><button className="btn" type="button" onClick={() => { setExportOpen(false); exportFormula() }}>{t.exportFormula}</button><button className="btn" type="button" onClick={() => { setExportOpen(false); void exportJson() }}>{t.jsonBackup}</button><button className="btn" type="button" onClick={() => { setExportOpen(false); print() }}>{t.printLabel}</button></div>}</div><div className="export-wrap"><button className="btn" type="button" onClick={() => { setExportOpen(false); setImportOpen((v) => !v) }}>{t.importLabel} ▾</button>{importOpen && <div className="export-menu open"><button className="btn" type="button" onClick={() => formulaFileRef.current?.click()}>{t.importFormula}</button><button className="btn" type="button" onClick={() => fileRef.current?.click()}>{t.importBackup}</button></div>}</div><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const file=e.target.files?.[0]; if (file) void importJson(file); e.currentTarget.value="" }} /><input ref={formulaFileRef} hidden type="file" accept=".json,application/json" onChange={(e) => { const file=e.target.files?.[0]; if (file) void importFormulaFile(file); e.currentTarget.value="" }} /></div><button className="btn archive-toggle" type="button" onClick={() => setArchiveOpen((v) => !v)}>{t.archive}<span className="archive-count">{archive.length}</span></button>{archiveOpen && <div className="archive-panel open">{archive.map((f) => <div className="archive-item" key={f.id}><div className="formula-code">{f.formulaId}</div><div className="formula-label">{f.name || t.untitled}</div><div className="archive-item-actions"><button className="btn" type="button" onClick={() => void restoreItem(f)}>{t.restore}</button><button className={`btn danger ${deleteState[f.id] || ""}`} type="button" onClick={() => deleteState[f.id] === "ready" ? void removeArchive(f) : beginDelete(f)}>{deleteState[f.id] === "confirming" ? t.confirmDelete : deleteState[f.id] === "ready" ? t.deleteNow : t.deletePermanently}</button></div></div>)}</div>}<div className="side-title">{t.ifraData}</div><div className="ifra-panel"><button className="btn" type="button" onClick={() => ifraFileRef.current?.click()}>{t.ifraImport}</button><input ref={ifraFileRef} hidden type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importIfraCsv(file); e.currentTarget.value = "" }} />{ifraDataset ? <div className="ifra-status">{t.ifraImported(ifraDataset.materials.length, new Date(ifraDataset.importedAt).toLocaleDateString())}</div> : <div className="ifra-status muted">{t.ifraNoData}</div>}<button className="btn" type="button" onClick={() => naturalContributionFileRef.current?.click()}>{t.ifraNaturalImport}</button><input ref={naturalContributionFileRef} hidden type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importNaturalContributionCsv(file); e.currentTarget.value = "" }} />{naturalContributionDataset ? <div className="ifra-status">{t.ifraNaturalImported(naturalContributionDataset.entries.length, new Date(naturalContributionDataset.importedAt).toLocaleDateString())}</div> : <div className="ifra-status muted">{t.ifraNaturalNoData}</div>}{ifraDataset && <div className="ifra-category-select"><button className="btn ifra-help-toggle" type="button" onClick={() => setCategoryHelpOpen((v) => !v)}>{t.ifraCategoryHelp}</button>{categoryHelpOpen && <div className="ifra-category-help"><div className="ifra-summary-note">{t.ifraCategoryHelpBody}</div><ul className="ifra-category-list">{Object.entries(IFRA_CATEGORY_DEFINITIONS).map(([key, def]) => <li key={key}><strong>{key}</strong> {def[language]}</li>)}</ul></div>}<div className="ifra-slot"><div className="ifra-slot-title">{t.ifraSlot1Title}</div><label>{t.ifraCategoryColumnLabel}<select value={primaryCategoryKey} onChange={(e) => saveIfraSettings({ primaryCategoryKey: e.target.value })}><option value="">{t.ifraSelectCategory}</option>{ifraDataset.categoryKeys.map((key) => <option key={key} value={key}>{categoryOptionLabel(key)}</option>)}</select></label></div><div className="ifra-slot"><div className="ifra-slot-title">{t.ifraSlot2Title}</div><label>{t.ifraCategoryColumnLabel}<select value={secondaryCategoryKey} onChange={(e) => saveIfraSettings({ secondaryCategoryKey: e.target.value })}><option value="">{t.ifraSelectCategory}</option>{ifraDataset.categoryKeys.map((key) => <option key={key} value={key}>{categoryOptionLabel(key)}</option>)}</select></label></div></div>}</div><div className="privacy"><strong>{t.privateByDefault}</strong><br />{t.localOnly}<br />VERSION v1.02</div></aside><main className="main"><section className="notebook"><header className="note-header"><div className="title-area"><div className="title-primary"><label>{t.formulaTitle}</label><input className="formula-name" value={active.name} placeholder={t.untitled} onChange={(e) => update({ name: e.target.value })} /></div><div className="title-hint">1,000 parts = 10.00 g · 1 part = 0.01 g</div></div><div><div className="page-box"><div className="page-key">{t.formulaId}</div><div className="page-value">{active.formulaId}</div><div className="page-key">{t.date}</div><div className="page-value">{fmtDate(active.date)}</div></div><div className="header-tools"><div className={`autosave-status ${status}`}><span className="autosave-dot" /><span>{status === 'saving' ? t.saving : status === 'session-only' ? t.sessionOnly : t.savedLocally}</span></div><div className="language-toggle"><button className={`lang-btn ${language === "en" ? "active" : ""}`} type="button" onClick={() => { setLanguage("en"); void storage.settings.save({ formulaIdPrefix: prefix, language: "en" }) }}><svg className="flag-svg" viewBox="0 0 7410 3900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
    </svg></button></div></div></div></header><div className="content"><div className="table-head"><div style={{ textAlign: "center" }}>{t.parts}</div><div>{t.material}</div><div>{t.cas}</div><div style={{ textAlign: "right" }}>{t.percent}</div><div /></div><div className="rows">{active.rows.map((row) => <Row key={row.id} row={row} t={t} ifraDataset={ifraDataset} primaryCategoryKey={primaryCategoryKey} secondaryCategoryKey={secondaryCategoryKey} onChange={(changes) => update({ rows: active.rows.map((r) => r.id === row.id ? { ...r, ...changes } : r) })} onRemove={() => update({ rows: active.rows.length === 1 ? [blankRow()] : active.rows.filter((r) => r.id !== row.id) })} />)}</div><div className="editor-actions"><button className="btn primary" type="button" onClick={() => update({ rows: [...active.rows, blankRow()] })}>{t.add}</button><button className="btn" type="button" onClick={() => void duplicate()}>{t.duplicate}</button><button className="btn" type="button" onClick={reset}>{t.reset}</button><button className="btn" type="button" onClick={() => void moveArchive()}>{t.move}</button></div><div className="summary-grid"><div><div className="notes-title">{t.notes}</div><textarea className="notes" placeholder={t.labNotes} value={active.notes} onChange={(e) => update({ notes: e.target.value })} /></div><div className="metrics"><div className="summary-title">{t.total}</div><div className="simple-total"><div className="main-line"><span>{t.formula}</span><strong>{totals.totalParts.toLocaleString()} / 1,000</strong></div><div className="sub-line"><span>{t.batch} <strong>{totals.batchWeightGrams.toFixed(2)} g</strong></span><span>{t.concentrate} <strong>{totals.concentratePercent.toFixed(2)}%</strong></span><span>{t.solvent} <strong>{totals.solventPercent.toFixed(2)}% · {(totals.batchWeightGrams * totals.solventPercent / 100).toFixed(2)} g</strong></span></div><div className={totals.complete ? "status ok" : "status bad"}>{totals.complete ? t.complete : totals.differenceParts > 0 ? t.addParts(totals.differenceParts) : t.reduceParts(Math.abs(totals.differenceParts))}</div></div></div></div>{ifraDataset && <section className="ifra-screening"><div className="ifra-screening-title">{t.ifraScreeningTitle}</div><div className="ifra-intended-usage"><label>{t.ifraIntendedUsageLabel}<input type="number" min="0" max="100" step="0.01" value={active.intendedUsagePercent ?? ''} onChange={(e) => update({ intendedUsagePercent: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} /></label><label>{t.ifraProductTypeLabel}<select value={intendedProductType} onChange={(e) => update({ intendedProductType: e.target.value as ProductType })}><option value="leave-on">{t.ifraLeaveOn}</option><option value="rinse-off">{t.ifraRinseOff}</option></select></label><div className="ifra-summary-note">{t.ifraIntendedUsageHint}</div></div><div className="ifra-screening-grid"><div className="ifra-screening-block"><div className="ifra-summary-row"><span>{primaryCategoryKey ? t.ifraMaxUsage(primaryCategoryKey) : t.ifraSlot1Title}</span><strong>{!primaryCategoryKey ? t.ifraSelectCategory : primaryUsage?.max != null ? `${primaryUsage.max.toFixed(2)}%` : t.ifraNoLimitData}</strong></div>{primaryUsage?.limitingRowId && <div className="ifra-summary-note">{t.ifraLimitedBy(materialName(primaryUsage.limitingRowId))}</div>}{limitComplianceNote(primaryUsage)}</div><div className="ifra-screening-block"><div className="ifra-summary-row"><span>{secondaryCategoryKey ? t.ifraMaxUsage(secondaryCategoryKey) : t.ifraSlot2Title}</span><strong>{!secondaryCategoryKey ? t.ifraSelectCategory : secondaryUsage?.max != null ? `${secondaryUsage.max.toFixed(2)}%` : t.ifraNoLimitData}</strong></div>{secondaryUsage?.limitingRowId && <div className="ifra-summary-note">{t.ifraLimitedBy(materialName(secondaryUsage.limitingRowId))}</div>}{limitComplianceNote(secondaryUsage)}</div><div className="ifra-screening-block"><div className="ifra-summary-row"><span>{t.ifraAllergenSection(t.ifraAllergen26, productTypeLabel(intendedProductType))}</span></div>{allergenSummary(allergens26)}</div><div className="ifra-screening-block"><div className="ifra-summary-row"><span>{t.ifraAllergenSection(t.ifraAllergen83, productTypeLabel(intendedProductType))}</span></div>{allergenSummary(allergens83)}</div></div><div className="ifra-disclaimer">{t.ifraDisclaimer}</div></section>}</div><footer className="note-footer"><span>{t.footer}</span><span>{active.formulaId}</span></footer></section></main></div>
}

function Row({ row, onChange, onRemove, t, ifraDataset, primaryCategoryKey, secondaryCategoryKey }: { row: FormulaMaterial; onChange: (changes: Partial<FormulaMaterial>) => void; onRemove: () => void; t: { strength: string; solventCarrier: string; total: string; solvent: string; removeDilution: string; ifraRowUnmatched: string }; ifraDataset?: IfraDataset; primaryCategoryKey: string; secondaryCategoryKey: string }) {
  const [open, setOpen] = useState(false)
  const dilution = row.dilution
  const notation = dilution?.enabled ? `@${dilution.percent}% in ${dilution.solvent || 'ALC'}` : ''
  const setDilution = (changes: Partial<NonNullable<FormulaMaterial['dilution']>>) => { if (!dilution) trackDilutionApplied(); onChange({ dilution: { enabled: true, percent: 10, solvent: 'ALC', ...dilution, ...changes } }) }
  const ifraBadge = (() => {
    if (!ifraDataset || (!primaryCategoryKey && !secondaryCategoryKey)) return null
    const matched = matchIfraMaterial(row, ifraDataset.materials)
    if (!matched) return row.cas?.trim() ? <span className="ifra-badge unmatched">{t.ifraRowUnmatched}</span> : null
    const parts: string[] = []
    if (primaryCategoryKey) parts.push(`${primaryCategoryKey} ${matched.limits[primaryCategoryKey] !== undefined ? `${matched.limits[primaryCategoryKey]}%` : '–'}`)
    if (secondaryCategoryKey) parts.push(`${secondaryCategoryKey} ${matched.limits[secondaryCategoryKey] !== undefined ? `${matched.limits[secondaryCategoryKey]}%` : '–'}`)
    return <span className="ifra-badge matched">{parts.join(' · ')}</span>
  })()
  const onMaterialChange = (value: string) => {
    if (row.cas?.trim()) { onChange({ material: value }); return }
    const query = value.trim().toLowerCase()
    const match = query ? ifraDataset?.materials.find((m) => m.name.trim().toLowerCase() === query) : undefined
    onChange(match ? { material: value, cas: match.cas } : { material: value })
  }
  return <>
    <div className={`row ${row.marked ? 'marked' : ''}`}><input className="parts" type="number" step="1" min="0" placeholder=" " value={row.parts} onChange={(e) => onChange({ parts: e.target.value === '' ? '' : Math.max(0, Math.trunc(Number(e.target.value))) })} /><div className="material-wrap"><input className="material" placeholder=" " value={row.material} onChange={(e) => onMaterialChange(e.target.value)} /><div className="material-meta">{notation && <span className="dilution-suffix">{notation}</span>}{isSolventMaterial(row.material) && <span className="solvent-badge">SOLVENT</span>}{ifraBadge}</div></div><input className="cas" placeholder=" " value={row.cas ?? ''} onChange={(e) => onChange({ cas: e.target.value })} /><div className="percent">{calculatePercent(row.parts).toFixed(1)}%</div><div className="row-actions"><button className={`dilution-btn ${dilution ? 'active' : ''}`} type="button" onClick={() => { if (!dilution) setDilution({}); setOpen((value) => !value) }}>DIL</button><button className={`mark-btn ${row.marked ? 'active' : ''}`} type="button" onClick={() => onChange({ marked: !row.marked })}>▰</button><button className="remove-btn" type="button" onClick={onRemove}>×</button></div></div>
    {open && dilution && <div className="dilution-panel"><div><label>{t.strength}</label><input type="number" min="0" max="100" step="1" value={dilution.percent} onChange={(e) => setDilution({ percent: Number(e.target.value) })} /></div><div><label>{t.solventCarrier}</label><input value={dilution.solvent} onChange={(e) => setDilution({ solvent: e.target.value })} /></div><div><label>Total</label><div className="dilution-result"><strong>{calculateDilution(row).solutionGrams.toFixed(2)} g</strong> · {t.solvent} {calculateDilution(row).solventGrams.toFixed(2)} g</div><button className="btn" type="button" onClick={() => { onChange({ dilution: undefined }); setOpen(false) }}>{t.removeDilution}</button></div></div>}
  </>
}

















