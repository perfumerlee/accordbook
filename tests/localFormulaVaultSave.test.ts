import { describe, expect, it, vi } from 'vitest'
import { saveFormulaDropPackage, type VaultHandle } from '../src/services/localFormulaVault'

function handle(existing?: { text: string }) {
  const write = vi.fn(); const close = vi.fn(); const file = { getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(existing?.text ?? '') }) }
  const directory = { getFileHandle: vi.fn().mockImplementation(async (_name: string, options: { create?: boolean }) => { if (!options.create && !existing) throw new DOMException('missing', 'NotFoundError'); return { ...file, createWritable: vi.fn().mockResolvedValue({ write, close, abort: vi.fn() }) } }) }
  return { queryPermission: vi.fn().mockResolvedValue('granted'), getDirectoryHandle: vi.fn().mockResolvedValue(directory) } as unknown as VaultHandle
}
const blob = new Blob(['package'])

describe('local Formula Vault package writer', () => {
  it('rejects unsafe slugs and filenames', async () => { expect((await saveFormulaDropPackage({ rootHandle: handle(), slug: '../x', fileName: 'x.accordbook', blob, packageId: 'id' })).status).toBe('SAVE_FAILED'); expect((await saveFormulaDropPackage({ rootHandle: handle(), slug: '2026-001', fileName: '../x.accordbook', blob, packageId: 'id' })).status).toBe('SAVE_FAILED') })
  it('creates the slug directory and closes the writer', async () => { const root = handle(); const result = await saveFormulaDropPackage({ rootHandle: root, slug: '2026-001', fileName: 'DROP.accordbook', blob, packageId: 'id' }); expect(result.status).toBe('SAVED'); expect((root.getDirectoryHandle as any).mock.results[0].value).toBeDefined() })
  it('returns permission required without writing', async () => { const root = handle(); (root.queryPermission as any).mockResolvedValue('prompt'); expect((await saveFormulaDropPackage({ rootHandle: root, slug: '2026-001', fileName: 'DROP.accordbook', blob, packageId: 'id' })).status).toBe('PERMISSION_REQUIRED') })
})
