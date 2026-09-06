import type { Formula } from '../models/formula'
import { toFormulaFile } from '../models/formulaFile'

export interface BuyerCredentials { name: string; phoneLast4: string; pin: string }
export interface PaidFormulaPackage {
  type: 'accordbook-paid-package'
  formatVersion: 1
  accessMode: 'offline-credentials-v1'
  packageId: string
  kdf: { algorithm: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  encryption: { algorithm: 'AES-GCM'; iv: string; tagLength: 128 }
  ciphertext: string
}

const encode64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function normalizeBuyerCredentials(value: BuyerCredentials): BuyerCredentials {
  const name = value.name.normalize('NFC').trim()
  if (!name || name.length > 100 || !/^\d{4}$/.test(value.phoneLast4) || !/^\d{6}$/.test(value.pin)) {
    throw new Error('Invalid buyer credentials')
  }
  return { name, phoneLast4: value.phoneLast4, pin: value.pin }
}

export async function createPaidFormulaPackage(formula: Formula, credentials: BuyerCredentials): Promise<PaidFormulaPackage> {
  const buyer = normalizeBuyerCredentials(credentials)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const header: Omit<PaidFormulaPackage, 'ciphertext'> = {
    type: 'accordbook-paid-package', formatVersion: 1, accessMode: 'offline-credentials-v1',
    packageId: crypto.randomUUID(),
    kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: encode64(salt) },
    encryption: { algorithm: 'AES-GCM', iv: encode64(iv), tagLength: 128 },
  }
  const encoder = new TextEncoder()
  const password = encoder.encode(JSON.stringify([buyer.name, buyer.phoneLast4, buyer.pin]))
  try {
    const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: header.kdf.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
    // All Formula data, including provenance checkpoints, stays inside the ciphertext.
    const plaintext = encoder.encode(JSON.stringify({ ...toFormulaFile(formula), provenance: formula.provenance ?? {} }))
    try {
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128, additionalData: encoder.encode(JSON.stringify(header)) }, key, plaintext)
      return { ...header, ciphertext: encode64(new Uint8Array(encrypted)) }
    } finally { plaintext.fill(0) }
  } finally { password.fill(0) }
}

export function createPaidFormulaFilename(formulaName: string, packageId: string): string {
  const safeName = formulaName
    .normalize('NFC')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
    .slice(0, 80) || 'accordbook-formula'
  const idPrefix = packageId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'package'
  return `${safeName}__Licensed__${idPrefix}.accordbook`
}

export function downloadPaidFormulaPackage(file: PaidFormulaPackage, formulaName = 'accordbook-formula'): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/vnd.accordbook' }))
  const link = document.createElement('a')
  link.href = url
  link.download = createPaidFormulaFilename(formulaName, file.packageId)
  document.body.append(link)
  try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
