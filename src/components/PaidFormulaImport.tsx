import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormulaFile } from '../models/formulaFile'
import { decryptPaidFormulaPackage, type PaidFormulaPackage } from '../services/paidFormulaPackage'
import { checkPaidFormulaLock, verifyPaidFormula } from '../services/paidFormulaRegistry'
import './paidFormulaExport.css'

export default function PaidFormulaImport({ file, language, onImport, onClose }: {
  file: PaidFormulaPackage; language: 'en' | 'ko'; onImport: (file: FormulaFile) => Promise<void>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const running = useRef(false)
  const mounted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const locked = lockedUntil > now
  const minutes = Math.max(1, Math.ceil((lockedUntil - now) / 60000))
  const ko = language === 'ko'
  useEffect(() => {
    mounted.current = true
    dialog.current?.showModal()
    return () => { mounted.current = false; dialog.current?.close() }
  }, [])
  useEffect(() => {
    let cancelled = false
    setChecking(true)
    void checkPaidFormulaLock(file.packageId).then(seconds => {
      if (cancelled || seconds === undefined) return
      setNow(Date.now())
      setLockedUntil(Date.now() + seconds * 1000)
    }).catch(() => {}).finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [file.packageId])
  useEffect(() => {
    if (!locked) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [locked])
  useEffect(() => { if (locked) errorRef.current?.focus() }, [locked, checking])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return createPortal(<dialog ref={dialog} className="paid-export-dialog" aria-labelledby="licensed-import-title" onCancel={event => { event.preventDefault(); if (!running.current) onClose() }}>
    <h2 id="licensed-import-title">{locked ? (ko ? '가져오기가 잠겼습니다' : 'Import temporarily locked') : (ko ? '라이선스 포뮬러 가져오기' : 'Import licensed formula')}</h2>
    {checking ? <><p className="paid-import-checking" role="status"><span className="paid-import-spinner" aria-hidden="true" />{ko ? '파일의 잠금 상태를 확인하고 있습니다…' : 'Checking file lock status…'}</p><div className="paid-export-actions"><button type="button" className="btn" onClick={onClose}>{ko ? '닫기' : 'Close'}</button></div></> : locked ? <>
      <p ref={errorRef} className="paid-import-error" role="alert" tabIndex={-1}>{ko ? '인증 시도 횟수를 초과해 이 파일의 가져오기가 일시적으로 제한되었습니다.' : 'Too many verification attempts. Importing this file is temporarily restricted.'}</p>
      <p>{ko ? `약 ${minutes}분 후 다시 시도할 수 있습니다.` : `You can try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`}</p>
      <div className="paid-export-actions"><button type="button" className="btn primary" onClick={onClose}>{ko ? '닫기' : 'Close'}</button></div>
    </> : <>
    <p><strong>{ko ? '구매자 정보를 확인합니다. 각 항목을 작성해주세요.' : 'We will verify your purchase. Please complete each field.'}</strong></p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (running.current || checking || locked) return
      const form = event.currentTarget
      const data = new FormData(form)
      running.current = true; setBusy(true); setError('')
      try {
        const buyer = { name: String(data.get('name') ?? ''), phoneLast4: String(data.get('phone') ?? ''), pin: String(data.get('pin') ?? '') }
        await verifyPaidFormula(file.packageId, buyer)
        const shared = await decryptPaidFormulaPackage(file, buyer)
        if (!mounted.current) return
        await onImport(shared)
        form.reset()
        if (mounted.current) onClose()
      } catch (caught) {
        if (mounted.current) {
          const lockMatch = caught instanceof Error ? /^LOCKED:(\d+)$/.exec(caught.message) : undefined
          if (lockMatch) {
            setNow(Date.now())
            setLockedUntil(Date.now() + Number(lockMatch[1]) * 1000)
          } else setError(ko ? '파일을 가져오지 못했습니다. 입력한 정보를 확인한 후 다시 시도해주세요. 인증에 5회 실패하면 30분 동안 다시 시도할 수 없습니다.' : 'The file could not be imported. Check your information and try again. Five failed verification attempts prevent another attempt for 30 minutes.')
        }
      }
      finally { running.current = false; if (mounted.current) setBusy(false) }
    }}>
      <fieldset disabled={busy}>
        <label>{ko ? '구매자 이름' : 'Buyer name'}<input name="name" maxLength={100} autoComplete="name" required autoFocus /></label>
        <label>{ko ? '전화번호 끝 4자리' : 'Last four phone digits'}<input name="phone" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required /></label>
        <label>PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required /></label>
      </fieldset>
      {error && <p ref={errorRef} className="paid-import-error" role="alert" aria-live="assertive" tabIndex={-1}>{error}</p>}
      <div className="paid-export-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>{ko ? '취소' : 'Cancel'}</button><button className="btn primary" disabled={busy}>{busy ? (ko ? '확인 중…' : 'Verifying…') : (ko ? '확인 후 가져오기' : 'Verify and import')}</button></div>
    </form></>}
  </dialog>, document.body)
}
