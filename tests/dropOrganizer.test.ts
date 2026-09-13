import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { organizeFile, scanOnce, validatePackage } from '../scripts/drop-organizer.mjs'

const packageText = (packageId = '00000000-0000-4000-8000-000000000001') => JSON.stringify({ type: 'accordbook-paid-package', formatVersion: 1, accessMode: 'offline-credentials-v1', packageId, kdf: { algorithm: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: '1234567890123456' }, encryption: { algorithm: 'AES-GCM', iv: '123456789012', tagLength: 128 }, ciphertext: '123456789012345678901234' })

async function fixture() { const root = await mkdtemp(join(tmpdir(), 'accordbook-drop-')); const inboxPath = join(root, 'inbox'); const vaultPath = join(root, 'vault'); await mkdir(inboxPath); await mkdir(vaultPath); return { inboxPath, vaultPath } }
describe('Formula Drop Inbox Organizer', () => {
  it('moves a valid full-slug package and creates the destination', async () => { const config = await fixture(); const source = join(config.inboxPath, 'ACBK-DROP-2026-001-Mcintosh-Apple.accordbook'); await writeFile(source, packageText()); expect((await organizeFile(source, config)).status).toBe('MOVED'); expect(await readFile(join(config.vaultPath, '2026-001', 'ACBK-DROP-2026-001-Mcintosh-Apple.accordbook'), 'utf8')).toContain('packageId') })
  it('leaves malformed and ambiguous packages in the Inbox', async () => { const config = await fixture(); const invalid = join(config.inboxPath, 'bad.accordbook'); const ambiguous = join(config.inboxPath, 'ACBK-DROP-001-Old.accordbook'); await writeFile(invalid, '{}'); await writeFile(ambiguous, packageText()); const results = await scanOnce(config); expect(results.map(result => result.status).sort()).toEqual(['INVALID_PACKAGE', 'UNMATCHED']) })
  it('rejects invalid package structure', () => { expect(() => validatePackage('{}')).toThrow('INVALID_PACKAGE') })
})
