import { describe, expect, it } from 'vitest'
import { inspectPaidFormulaPackageText } from '../scripts/formula-drop-inspect.mjs'

const valid = JSON.stringify({ type: 'accordbook-paid-package', formatVersion: 1, accessMode: 'offline-credentials-v1', packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: Buffer.alloc(16).toString('base64') }, encryption: { algorithm: 'AES-GCM', iv: Buffer.alloc(12).toString('base64'), tagLength: 128 }, ciphertext: Buffer.alloc(16).toString('base64') })
describe('Formula Drop package inspector', () => {
  it('reports only safe outer package metadata', () => { expect(inspectPaidFormulaPackageText(valid, 'DROP-2026-001.accordbook')).toEqual({ packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', formatVersion: 1, accessMode: 'offline-credentials-v1', fileName: 'DROP-2026-001.accordbook' }) })
  it('rejects malformed packages without decrypting content', () => { expect(() => inspectPaidFormulaPackageText('{}')).toThrow(); expect(() => inspectPaidFormulaPackageText(valid.replace('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'not-a-package'))).toThrow() })
})
