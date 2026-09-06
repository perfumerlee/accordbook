import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula } from '../models/formula'
import { createPaidFormulaPackage, downloadPaidFormulaPackage, type PaidFormulaPackage } from '../services/paidFormulaPackage'
import { PAID_REGISTRY_ENDPOINT, formatBuyerPhone, generateBuyerPin, registerPaidFormula, validateBuyerPhone, type LicenseRegistration } from '../services/paidFormulaRegistry'
import './paidFormulaExport.css'

const SELLER_TOKEN_STORAGE_KEY = 'accordbook.paid.seller-token'

export default function PaidFormulaExport({ formula, language }: { formula: Formula; language: 'en' | 'ko' }) {
  const [snapshot, setSnapshot] = useState<Formula>()
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || !(event.ctrlKey || event.metaKey) || !event.altKey || event.shiftKey || event.code !== 'KeyL') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [inert]')) return
      if (document.querySelector('dialog[open], [aria-modal="true"]:not([inert]), .time-machine-stage.is-open, .origin-popover, .mobile-formula-menu.open, .material-focus-backdrop')) return
      event.preventDefault()
      setSnapshot(structuredClone(formula))
    }
    window.addEventListener('keydown', open)
    return () => window.removeEventListener('keydown', open)
  }, [formula])
  return snapshot ? <ExportDialog formula={snapshot} language={language} close={() => setSnapshot(undefined)} /> : null
}

function ExportDialog({ formula, language, close }: { formula: Formula; language: 'en' | 'ko'; close: () => void }) {
  const ko = language === 'ko'
  const dialog = useRef<HTMLDialogElement>(null)
  const running = useRef(false)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const [sellerToken, setSellerToken] = useState(() => localStorage.getItem(SELLER_TOKEN_STORAGE_KEY) ?? '')
  const [error, setError] = useState(false)
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [registered, setRegistered] = useState(false)
  const [copied, setCopied] = useState(false)
  const issuance = useRef<{ file: PaidFormulaPackage; record: LicenseRegistration } | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    const opener = document.activeElement
    dialog.current?.showModal()
    return () => {
      mounted.current = false
      dialog.current?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(<dialog ref={dialog} className="paid-export-dialog" aria-labelledby="paid-export-title" onCancel={event => { event.preventDefault(); if (!running.current) close() }}>
    <form autoComplete="off" onSubmit={async event => {
      event.preventDefault()
      if (running.current) return
      const form = event.currentTarget
      const data = new FormData(form)
      running.current = true; setBusy(true); setError(false)
      try {
        if (!issuance.current) {
          const fullPhone = validateBuyerPhone(phone)
          const name = String(data.get('buyerName') ?? '').normalize('NFC').trim()
          const file = await createPaidFormulaPackage(formula, { name, phoneLast4: fullPhone.slice(-4), pin })
          issuance.current = { file, record: { packageId: file.packageId, buyerName: name, phone: fullPhone, pin, productName: formula.name } }
        }
        const pending = issuance.current
        const token = String(data.get('sellerToken') ?? '').trim()
        await registerPaidFormula(PAID_REGISTRY_ENDPOINT, token, pending.record)
        localStorage.setItem(SELLER_TOKEN_STORAGE_KEY, token)
        if (mounted.current) { setRegistered(true); downloadPaidFormulaPackage(pending.file, formula.name) }
      } catch { if (mounted.current) setError(true) }
      finally { if (mounted.current) { running.current = false; setBusy(false) } }
    }}>
      <h2 id="paid-export-title">{ko ? '라이선스 Formula 내보내기' : 'Licensed Formula Export'}</h2>
      <p>{formula.name || (ko ? '제목 없는 포뮬러' : 'Untitled formula')}</p>
      <p>{ko ? '라이선스 발급 기록을 등록한 후 파일을 내려받습니다. 구매자는 포뮬러 가져오기에서 구매 정보와 PIN을 확인한 뒤 열 수 있습니다.' : 'Registers the license before download. Buyers can use Import formula and verify their purchase details and PIN to open the file.'}</p>
      <fieldset disabled={busy || registered}>
        <label>{ko ? '판매자 등록 키' : 'Seller registration token'}<input name="sellerToken" type="password" minLength={32} autoComplete="off" value={sellerToken} onChange={event => setSellerToken(event.target.value)} required /></label>
      </fieldset>
      <button className="btn token-clear-btn" type="button" onClick={() => { localStorage.removeItem(SELLER_TOKEN_STORAGE_KEY); setSellerToken('') }} disabled={busy || registered}>{ko ? '저장된 등록 키 삭제' : 'Clear saved token'}</button>
      <fieldset disabled={busy || !!issuance.current}>
        <label>{ko ? '구매자 이름' : 'Buyer name'}<input name="buyerName" required maxLength={100} autoFocus /></label>
        <label>{ko ? '휴대폰 번호' : 'Phone number'}<input name="phone" type="tel" inputMode="numeric" placeholder="010-1234-5678" pattern="010-[0-9]{4}-[0-9]{4}" maxLength={13} value={phone} onChange={event => setPhone(formatBuyerPhone(event.target.value))} required /></label>
        <button className="btn" type="button" onClick={() => { setPin(generateBuyerPin()); setCopied(false) }}>{pin ? (ko ? 'PIN 다시 생성' : 'Regenerate PIN') : (ko ? 'PIN 생성' : 'Generate PIN')}</button>
      </fieldset>
      {pin && <><label>{ko ? '라이선스 PIN — 구매자에게 전달하세요' : 'License PIN — share with buyer'}<input readOnly value={pin} aria-label="PIN" /></label><button className="btn" type="button" onClick={async () => { try { await navigator.clipboard.writeText(pin); setCopied(true) } catch { setCopied(false) } }}>{copied ? (ko ? '복사됨' : 'Copied') : (ko ? 'PIN 복사' : 'Copy PIN')}</button></>}
      {error && <p role="alert">{ko ? '등록 확인에 실패했습니다. URL·판매자 키·배포 권한을 확인하고 같은 요청으로 다시 시도하세요. 시트에 이미 기록됐을 수도 있으며 재시도 시 중복 등록하지 않습니다.' : 'Registration not confirmed. Check URL, seller token and deployment access, then retry. The row may already exist; retries are deduplicated.'}</p>}
      {registered && <p role="status">{ko ? '시트 등록 완료. PIN을 복사한 뒤 닫으세요.' : 'Registered. Copy the PIN before closing.'}</p>}
      <div className="paid-export-actions"><button type="button" className="btn" onClick={close} disabled={busy}>{ko ? '닫기' : 'Close'}</button>{registered ? <button className="btn" type="button" onClick={() => issuance.current && downloadPaidFormulaPackage(issuance.current.file, formula.name)}>{ko ? '파일 다시 받기' : 'Download again'}</button> : <button className="btn primary" type="submit" disabled={busy}>{busy ? (ko ? '등록 중…' : 'Registering…') : (ko ? '라이선스 등록 후 파일 저장' : 'Register license and download')}</button>}</div>
    </form>
  </dialog>, document.body)
}
