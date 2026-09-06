import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { createPaidFormulaPackage, normalizeBuyerCredentials, type PaidFormulaPackage } from '../src/services/paidFormulaPackage'
import { parseFormulaFile } from '../src/services/formulaFile'

const formula: Formula = { id: 'local-id', formulaId: 'ACC-TEST', date: '2026-09-07', name: 'Secret Citrus', notes: 'Private notes', createdAt: '', updatedAt: '', rows: [{ id: 'row-id', material: 'Linalool', parts: 1000, dilution: { enabled: true, percent: 10, solvent: 'ALC' } }] }
const buyer = { name: '홍길동', phoneLast4: '0012', pin: '012345' }
const bytes = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
async function decrypt(file: PaidFormulaPackage, pin = buyer.pin) {
  const { ciphertext, ...header } = file
  const encoder = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', encoder.encode(JSON.stringify([buyer.name, buyer.phoneLast4, pin])), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: file.kdf.hash, salt: bytes(file.kdf.salt), iterations: file.kdf.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(file.encryption.iv), tagLength: 128, additionalData: encoder.encode(JSON.stringify(header)) }, key, bytes(ciphertext)))
}

describe('Paid Formula export', () => {
  it('round-trips contents without mutating the source or exposing plaintext', async () => {
    const original = structuredClone(formula)
    const file = await createPaidFormulaPackage(formula, buyer)
    const serialized = JSON.stringify(file)
    for (const secret of [formula.name, formula.notes, 'Linalool', buyer.name, 'phoneLast4', '"pin"']) expect(serialized).not.toContain(secret)
    const decoded = parseFormulaFile(await decrypt(file))
    expect(decoded.formula.name).toBe(formula.name)
    expect(decoded.formula.rows[0]).toMatchObject({ material: 'Linalool', parts: 1000, dilution: formula.rows[0].dilution })
    expect(formula).toEqual(original)
    expect(() => parseFormulaFile(serialized)).toThrow()
  })
  it('uses fresh salt and IV and rejects wrong PIN, ciphertext and header tampering', async () => {
    const a = await createPaidFormulaPackage(formula, buyer)
    const b = await createPaidFormulaPackage(formula, buyer)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.encryption.iv).not.toBe(b.encryption.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    await expect(decrypt(a, '999999')).rejects.toThrow()
    await expect(decrypt({ ...a, packageId: 'modified' })).rejects.toThrow()
    await expect(decrypt({ ...a, ciphertext: (a.ciphertext[0] === 'A' ? 'B' : 'A') + a.ciphertext.slice(1) })).rejects.toThrow()
  })
  it('validates credentials and preserves leading zeros', () => {
    expect(normalizeBuyerCredentials({ ...buyer, name: ' 홍길동 ' })).toEqual(buyer)
    for (const changes of [{ name: ' ' }, { phoneLast4: '12' }, { pin: '12345' }, { pin: 'abcdef' }]) {
      expect(() => normalizeBuyerCredentials({ ...buyer, ...changes })).toThrow()
    }
  })
})
