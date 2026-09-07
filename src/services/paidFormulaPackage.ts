import type { Formula, FormulaVersionSnapshot, FormulaProvenance } from '../models/formula'
import { toFormulaFile } from '../models/formulaFile'
import { parseFormulaFile } from './formulaFile'

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

export type PaidFormulaContent = Omit<ReturnType<typeof toFormulaFile>, 'exportedAt'> & { provenance: Record<string, unknown> }

export function toPaidFormulaContent(source: Formula | FormulaVersionSnapshot, provenance: FormulaProvenance | Record<string, unknown> = {}): PaidFormulaContent {
  const file = 'id' in source ? toFormulaFile(source) : {
    type: 'accordbook-formula' as const,
    formatVersion: 2 as const,
    exportedAt: new Date().toISOString(),
    formula: { name: source.name, notes: source.notes, rows: source.rows.map(row => ({ ...row })) },
  }
  const { exportedAt: _exportedAt, ...content } = file
  return { ...content, provenance: provenance as Record<string, unknown> }
}

const encode64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const decode64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))

export function parsePaidFormulaPackage(text: string): PaidFormulaPackage {
  if (text.length > 16_000_000) throw new Error('Package too large')
  const file = JSON.parse(text)
  if (!file || file.type !== 'accordbook-paid-package' || file.formatVersion !== 1 || file.accessMode !== 'offline-credentials-v1'
    || typeof file.packageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(file.packageId)
    || file.kdf?.algorithm !== 'PBKDF2' || file.kdf.hash !== 'SHA-256' || file.kdf.iterations !== 600000
    || file.encryption?.algorithm !== 'AES-GCM' || file.encryption.tagLength !== 128
    || typeof file.kdf.salt !== 'string' || typeof file.encryption.iv !== 'string' || typeof file.ciphertext !== 'string'
    || decode64(file.kdf.salt).length !== 16 || decode64(file.encryption.iv).length !== 12 || decode64(file.ciphertext).length < 16) throw new Error('Invalid licensed package')
  return file
}

export async function decryptPaidFormulaPackage(file: PaidFormulaPackage, credentials: BuyerCredentials) {
  parsePaidFormulaPackage(JSON.stringify(file))
  const buyer = normalizeBuyerCredentials(credentials)
  const { ciphertext, ...header } = file
  const encoder = new TextEncoder()
  const password = encoder.encode(JSON.stringify([buyer.name, buyer.phoneLast4, buyer.pin]))
  try {
    const material = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: decode64(file.kdf.salt), iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(file.encryption.iv), tagLength: 128, additionalData: encoder.encode(JSON.stringify(header)) }, key, decode64(ciphertext)))
    try { return parseFormulaFile(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) }
    finally { plaintext.fill(0) }
  } finally { password.fill(0) }
}

export function normalizeBuyerCredentials(value: BuyerCredentials): BuyerCredentials {
  const name = value.name.normalize('NFC').trim()
  if (!name || name.length > 100 || !/^\d{4}$/.test(value.phoneLast4) || !/^\d{6}$/.test(value.pin)) {
    throw new Error('Invalid buyer credentials')
  }
  return { name, phoneLast4: value.phoneLast4, pin: value.pin }
}

export async function createPaidFormulaPackage(formula: Formula, credentials: BuyerCredentials): Promise<PaidFormulaPackage> {
  return createPaidFormulaPackageFromContent(toPaidFormulaContent(formula, formula.provenance ?? {}), credentials)
}

export async function createPaidFormulaPackageFromContent(content: PaidFormulaContent, credentials: BuyerCredentials): Promise<PaidFormulaPackage> {
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
    const plaintext = encoder.encode(JSON.stringify({ ...content, exportedAt: new Date().toISOString() }))
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
