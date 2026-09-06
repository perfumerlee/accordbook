import { normalizeBuyerCredentials, type BuyerCredentials } from './paidFormulaPackage'

export const PAID_REGISTRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwf6CSd35zBMwqUh8a5ftpV7lGfS8MzjmkpCLWiIToEK_0c4OsbWna-307qrDIwWTWJ/exec'

export async function verifyPaidFormula(packageId: string, credentials: BuyerCredentials): Promise<void> {
  const buyer = normalizeBuyerCredentials(credentials)
  const response = await fetch(PAID_REGISTRY_ENDPOINT, {
    method: 'POST', redirect: 'follow', credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'verify', packageId, buyerName: buyer.name, phoneLast4: buyer.phoneLast4, pin: buyer.pin }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error('Verification failed')
  const result = await response.json()
  if (result.locked === true) throw new Error(`LOCKED:${Math.max(0, Number(result.retryAfterSeconds) || 0)}`)
  if (result.ok !== true || result.packageId !== packageId) throw new Error('Verification failed')
}

export function formatBuyerPhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

export function validateBuyerPhone(input: string): string {
  if (!/^(010\d{8}|010-\d{4}-\d{4})$/.test(input)) throw new Error('Invalid phone')
  return formatBuyerPhone(input)
}

export function generateBuyerPin(): string {
  // Rejection sampling avoids modulo bias and preserves leading zeros.
  const buffer = new Uint32Array(1)
  do { crypto.getRandomValues(buffer) } while (buffer[0] >= 4294000000)
  return String(buffer[0] % 1000000).padStart(6, '0')
}

export interface LicenseRegistration {
  packageId: string
  buyerName: string
  phone: string
  pin: string
  productName: string
}

export async function registerPaidFormula(endpoint: string, sellerToken: string, record: LicenseRegistration): Promise<void> {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.trim())) throw new Error('Invalid Apps Script URL')
  if (sellerToken.length < 32) throw new Error('Invalid seller token')
  const response = await fetch(endpoint.trim(), {
    method: 'POST', redirect: 'follow', credentials: 'omit',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'register', sellerToken, ...record, phone: validateBuyerPhone(record.phone) }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error('Registration failed')
  const result = await response.json()
  if (result.ok !== true || result.packageId !== record.packageId) throw new Error('Registration not confirmed')
}
