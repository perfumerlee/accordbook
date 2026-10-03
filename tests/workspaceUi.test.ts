import { describe, expect, it, vi } from 'vitest'
import { parseAccordbookInput, workspaceFilename, preparationMessage, importErrorMessage, downloadWorkspace } from '../src/services/workspaceUi'
import { workspaceMessages } from '../src/i18n/workspaceMessages'
import { engineFixture } from './workspaceEngineFixtures'

describe('Workspace UI boundary', () => {
  it('routes Workspace, legacy and paid independently and keeps Backup separate', async () => {
    const { file } = await engineFixture()
    expect(parseAccordbookInput(JSON.stringify(file)).kind).toBe('workspace')
    for (const version of [1, 2]) expect(parseAccordbookInput(JSON.stringify({ type: 'accordbook-formula', formatVersion: version })).kind).toBe('formula')
    expect(parseAccordbookInput('{"type":"accordbook-paid-package"}').kind).toBe('paid')
    expect(() => parseAccordbookInput('{"app":"Accordbook","formatVersion":3}')).toThrow('unsupported')
  })
  it('distinguishes unsupported, damaged and broken history before import', async () => {
    const { file } = await engineFixture()
    expect(() => parseAccordbookInput('{')).toThrow('damaged')
    expect(() => parseAccordbookInput(JSON.stringify({ ...file, formatVersion: 9 }))).toThrow('version')
    file.formula.releasedVersionId = 'missing'
    expect(() => parseAccordbookInput(JSON.stringify(file))).toThrow('history')
  })
  it('uses actionable blocker and importer messages in both locales', () => {
    const cases = ['unsaved-experiment-draft', 'unsaved-branch-intent', 'unfinished-version-draft', 'unfinished-structural-edit', 'busy', 'flush-failed'] as const
    for (const reason of cases) for (const locale of ['en', 'ko'] as const) expect(workspaceMessages[locale][preparationMessage({ ready: false, reason })]).toBeTruthy()
    expect(importErrorMessage('invalid-provenance')).toBe('integrity')
    expect(importErrorMessage('concurrent-allocation')).toBe('concurrent')
    expect(importErrorMessage('atomic-commit-failed')).toBe('storage')
    expect(Object.keys(workspaceMessages.en)).toEqual(Object.keys(workspaceMessages.ko))
  })
  it('sanitizes and bounds friendly filenames', () => {
    expect(workspaceFilename(' Oak / Rum: Study? ')).toBe('accordbook-oak-rum-study.accordbook')
    expect(workspaceFilename('')).toBe('accordbook-formula.accordbook')
    expect(workspaceFilename('x'.repeat(1000)).length).toBeLessThan(150)
  })
  it('cleans up the download URL and element even when click fails', () => {
    const remove = vi.fn(), revoke = vi.fn(), append = vi.fn()
    const link = { href: '', download: '', remove, click: () => { throw new Error('download failed') } }
    vi.stubGlobal('document', { createElement: () => link, body: { append } })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qa')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
    try {
      expect(() => downloadWorkspace('{}', 'QA')).toThrow('download failed')
      expect(remove).toHaveBeenCalledOnce(); expect(revoke).toHaveBeenCalledWith('blob:qa')
      expect(create.mock.calls[0][0]).toHaveProperty('type','application/vnd.accordbook')
    } finally { vi.unstubAllGlobals(); create.mockRestore(); revokeSpy.mockRestore() }
  })
})
