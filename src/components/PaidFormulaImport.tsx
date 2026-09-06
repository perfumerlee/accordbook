import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormulaFile } from '../models/formulaFile'
import { decryptPaidFormulaPackage, type PaidFormulaPackage } from '../services/paidFormulaPackage'
import { verifyPaidFormula } from '../services/paidFormulaRegistry'
import './paidFormulaExport.css'

export default function PaidFormulaImport({ file, language, onImport, onClose }: {
  file: PaidFormulaPackage; language: 'en' | 'ko'; onImport: (file: FormulaFile) => Promise<void>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const running = useRef(false)
  const mounted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ko = language === 'ko'
  useEffect(() => {
    mounted.current = true
    dialog.current?.showModal()
    return () => { mounted.current = false; dialog.current?.close() }
  }, [])
  return createPortal(<dialog ref={dialog} className="paid-export-dialog" aria-labelledby="licensed-import-title" onCancel={event => { event.preventDefault(); if (!running.current) onClose() }}>
    <h2 id="licensed-import-title">{ko ? '라이선스 포뮬러 가져오기' : 'Import licensed formula'}</h2>
    <p>{ko ? '구매자 정보를 확인합니다. 입력한 이름·전화번호 끝 4자리·PIN이 라이선스 확인 서버로 전송됩니다. 인터넷 연결이 필요합니다.' : 'Your name, last four phone digits and PIN are sent to the license server for verification. An internet connection is required.'}</p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (running.current) return
      const form = event.currentTarget
      const data = new FormData(form)
      running.current = true; setBusy(true); setError(false)
      try {
        const buyer = { name: String(data.get('name') ?? ''), phoneLast4: String(data.get('phone') ?? ''), pin: String(data.get('pin') ?? '') }
        await verifyPaidFormula(file.packageId, buyer)
        const shared = await decryptPaidFormulaPackage(file, buyer)
        if (!mounted.current) return
        await onImport(shared)
        form.reset()
        if (mounted.current) onClose()
      } catch { if (mounted.current) setError(true) }
      finally { running.current = false; if (mounted.current) setBusy(false) }
    }}>
      <fieldset disabled={busy}>
        <label>{ko ? '구매자 이름' : 'Buyer name'}<input name="name" maxLength={100} autoComplete="name" required autoFocus /></label>
        <label>{ko ? '전화번호 끝 4자리' : 'Last four phone digits'}<input name="phone" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required /></label>
        <label>PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required /></label>
      </fieldset>
      {error && <p role="alert">{ko ? '인증 또는 가져오기에 실패했습니다. 구매 정보·인터넷 연결을 확인하고 다시 시도하세요. 문제가 계속되면 판매자에게 문의하세요.' : 'Verification or import failed. Check your purchase details and connection, then retry. Contact the seller if the problem persists.'}</p>}
      <div className="paid-export-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>{ko ? '취소' : 'Cancel'}</button><button className="btn primary" disabled={busy}>{busy ? (ko ? '확인 중…' : 'Verifying…') : (ko ? '확인 후 가져오기' : 'Verify and import')}</button></div>
    </form>
  </dialog>, document.body)
}
