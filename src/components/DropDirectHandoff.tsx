import { useEffect, useRef, useState } from 'react'
import type { FormulaFile } from '../models/formulaFile'
import { parseFormulaFile } from '../services/formulaFile'
import { resolveFormulaDropPackage } from '../services/formulaDropPublicApi'
import { validateFormulaDropId } from '../services/formulaDropPackage'
import { startFormulaDropDownload } from '../services/formulaDropDownload'
import { createFormulaDropEvent, sendFormulaDropEvent } from '../services/formulaDropEvents'
import { savedDropSessionLanguage, savedDropLanguage } from '../i18n/language'
import './dropDirectHandoff.css'

export function clearDropActionUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('from'); url.searchParams.delete('drop')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
export default function DropDirectHandoff({ dropId, language, onImport, onClose }: { dropId: string; language: 'en' | 'ko'; onImport: (file: FormulaFile) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const running = useRef(false)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<'resolving' | 'validating' | 'ready' | 'importing' | 'error'>('resolving')
  const [prepared, setPrepared] = useState<FormulaFile>()
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const ko = (savedDropSessionLanguage() ?? savedDropLanguage() ?? language) === 'ko'
  const emit = (event: Parameters<typeof createFormulaDropEvent>[1], failureReason?: string) => {
    if (validateFormulaDropId(dropId)) void sendFormulaDropEvent(createFormulaDropEvent(dropId, event, { source: 'direct_handoff', failureReason }))
  }
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  useEffect(() => { if (state === 'ready') confirmButton.current?.focus() }, [state])
  useEffect(() => {
    const controller = new AbortController()
    if (!validateFormulaDropId(dropId)) { setState('error'); return }
    const timeout = window.setTimeout(() => { controller.abort(); setState('error'); emit('drop_handoff_load_failure', 'resolver_timeout') }, 15000)
    void (async () => {
      try {
        const result = await resolveFormulaDropPackage(dropId, controller.signal)
        if (controller.signal.aborted) return
        setState('validating')
        const file = parseFormulaFile(result.packageText)
        setPrepared(file); setState('ready'); emit('drop_handoff_load_success')
      } catch (error) {
        if (controller.signal.aborted) return
        setState('error'); emit('drop_handoff_load_failure', error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'resolver_failed')
      } finally { window.clearTimeout(timeout) }
    })()
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [dropId])
  const close = () => { if (running.current) return; clearDropActionUrl(); onClose() }
  const confirm = async () => {
    if (!prepared || running.current) return
    running.current = true; setState('importing'); emit('import_attempt')
    try { await onImport(prepared); emit('import_success'); emit('drop_handoff_import_success'); clearDropActionUrl(); onClose() }
    catch { emit('import_failed', 'storage_failed'); setState('error') }
    finally { running.current = false }
  }
  const download = async () => {
    if (downloadBusy) return
    setDownloadBusy(true); setDownloadError(false)
    try { await startFormulaDropDownload(dropId) } catch { setDownloadError(true) } finally { setDownloadBusy(false) }
  }
  const heading = state === 'resolving' ? (ko ? '포뮬러를 불러오는 중…' : 'OPENING FORMULA…') : state === 'validating' ? (ko ? '포뮬러를 확인하는 중…' : 'VALIDATING…') : state === 'ready' ? (ko ? '가져올 준비가 되었습니다' : 'READY TO IMPORT') : state === 'importing' ? (ko ? '가져오는 중…' : 'IMPORTING…') : (ko ? '포뮬러를 불러오지 못했습니다' : 'FORMULA COULD NOT BE LOADED')
  return <dialog ref={dialog} className="drop-direct-dialog" aria-labelledby="drop-direct-title" lang={ko ? 'ko' : 'en'} onCancel={event => { event.preventDefault(); close() }}>
    <h2 id="drop-direct-title" aria-live="polite">{heading}</h2>
    {prepared && <><p>{prepared.formula.name}</p><p>{prepared.formula.rows.length} {ko ? '원료' : 'materials'} · {prepared.formula.rows.reduce((sum, row) => sum + (typeof row.parts === 'number' ? row.parts : 0), 0)} parts</p></>}
    {state === 'ready' && <button ref={confirmButton} className="btn primary" onClick={() => void confirm()}>{ko ? '포뮬러 가져오기' : 'IMPORT FORMULA'}</button>}
    {state === 'error' && <>{validateFormulaDropId(dropId) ? <button className="btn" disabled={downloadBusy} onClick={() => void download()}>{ko ? '.accordbook 파일 다운로드' : 'DOWNLOAD .ACCORDBOOK FILE'}</button> : <a href="/drop">{ko ? 'Formula Drop 목록' : 'Formula Drops'}</a>}{downloadError && <p role="alert">{ko ? '다운로드할 수 없습니다. 연결을 확인하고 다시 시도하세요.' : 'Download unavailable. Check your connection and try again.'}</p>}</>}
    <button className="btn" disabled={state === 'importing'} onClick={close}>{ko ? '닫기' : 'Close'}</button>
  </dialog>
}
