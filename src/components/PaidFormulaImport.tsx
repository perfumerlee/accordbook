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
  const ko = language === 'ko'
  useEffect(() => {
    mounted.current = true
    dialog.current?.showModal()
    return () => { mounted.current = false; dialog.current?.close() }
  }, [])
  useEffect(() => {
    let cancelled = false
    void checkPaidFormulaLock(file.packageId).then(seconds => {
      if (cancelled || seconds === undefined) return
      const minutes = Math.max(1, Math.ceil(seconds / 60))
      setError(ko ? `인증 시도 횟수를 초과했습니다. 약 ${minutes}분 후 다시 시도해주세요.` : `Too many verification attempts. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [file.packageId, ko])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return createPortal(<dialog ref={dialog} className="paid-export-dialog" aria-labelledby="licensed-import-title" onCancel={event => { event.preventDefault(); if (!running.current) onClose() }}>
    <h2 id="licensed-import-title">{ko ? '라이선스 포뮬러 가져오기' : 'Import licensed formula'}</h2>
    <p><strong>{ko ? '구매자 정보를 확인합니다. 각 항목을 작성해주세요.' : 'We will verify your purchase. Please complete each field.'}</strong></p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (running.current) return
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
            const minutes = Math.max(1, Math.ceil(Number(lockMatch[1]) / 60))
            setError(ko ? `인증 시도 횟수를 초과했습니다. 약 ${minutes}분 후 다시 시도해주세요.` : `Too many verification attempts. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`)
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
    </form>
  </dialog>, document.body)
}
