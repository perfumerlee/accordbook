import { describe, expect, it, vi } from 'vitest'
import { createStorage } from '../src/storage/storageService'
import { collectWorkspace } from '../src/services/workspaceCollector'
import { WorkspaceExportCoordinator, WorkspaceWriteQueue, type WorkspaceBlockReason } from '../src/services/workspaceExportCoordinator'
import { engineFixture } from './workspaceEngineFixtures'

describe('Workspace collection and export preparation', () => {
  it('collects cloned domain records, only the requested owner; rejects missing and broken workspaces', async () => {
    const storage = await createStorage(); const { source } = await engineFixture()
    await storage.workspaces.appendWorkspaceAtomic(source)
    const result = await collectWorkspace(storage, source.formula.id)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('fixture')
    expect(result.workspace.formula.rows[0].id).toBe('editor-only')
    result.workspace.formula.name = 'mutated'
    expect((await storage.formulas.get(source.formula.id))!.name).toBe('Workspace')
    expect(await collectWorkspace(storage, 'missing')).toEqual({ ok: false, code: 'formula-not-found' })
    await storage.versions.delete('restore')
    const broken = structuredClone(source.experiments[0]); broken.baseSource = { kind: 'version', sourceVersionId: 'restore' }
    await storage.experiments.save(broken)
    expect(await collectWorkspace(storage, source.formula.id)).toMatchObject({ ok: false, code: 'invalid-workspace-graph', diagnostic: { reason: 'missing BASE Version' } })
  })
  it('drains prior writes, provenance and accepted Experiment edits before a frozen coherent read', async () => {
    const storage = await createStorage(); const { source } = await engineFixture()
    const order: string[] = []; let frozen = false
    const coordinator = new WorkspaceExportCoordinator(() => { frozen = true; order.push('freeze'); return () => { frozen = false; order.push('release') } })
    const writes = new WorkspaceWriteQueue(); let finish!: () => void
    const inFlight = writes.enqueue(async () => { await new Promise<void>(r => { finish = r }); order.push('prior-save') })
    await Promise.resolve()
    coordinator.register({ formulaId: source.formula.id, role: 'formula', blockedReason: () => undefined, flush: async () => {
      await writes.drain(); order.push('provenance'); order.push('formula-flush'); await storage.formulas.save(source.formula)
      for (const v of source.versions) await storage.versions.save(v)
    } })
    coordinator.register({ formulaId: source.formula.id, role: 'experiment', blockedReason: () => undefined, flush: async () => {
      order.push('experiment-flush'); for (const e of source.experiments) await storage.experiments.save(e)
    } })
    const read = storage.workspaces.readWorkspace.bind(storage.workspaces)
    vi.spyOn(storage.workspaces, 'readWorkspace').mockImplementation(async id => { expect(frozen).toBe(true); order.push('read'); return read(id) })
    const preparing = coordinator.prepare(storage, source.formula.id)
    expect(frozen).toBe(true); expect(order).toEqual(['freeze'])
    await expect(coordinator.runMutation(async () => undefined)).rejects.toThrow('preparing')
    finish(); await inFlight
    expect(await preparing).toMatchObject({ ready: true, persistence: 'memory' })
    expect(order).toEqual(['freeze', 'prior-save', 'provenance', 'formula-flush', 'experiment-flush', 'read', 'release'])
    expect(coordinator.frozen).toBe(false)
  })
  it.each(['unsaved-experiment-draft', 'unsaved-branch-intent', 'unfinished-structural-edit'] as WorkspaceBlockReason[])('blocks %s without saving or discarding raw input', async reason => {
    const storage = await createStorage(); const save = vi.fn(); const release = vi.fn()
    const coordinator = new WorkspaceExportCoordinator(() => release)
    coordinator.register({ formulaId: 'f', role: 'formula', blockedReason: () => undefined, flush: save })
    const rawDraft = { observation: 'unfinished' }
    coordinator.register({ formulaId: 'f', role: 'draft', blockedReason: () => reason, flush: save })
    const read = vi.spyOn(storage.workspaces, 'readWorkspace')
    expect(await coordinator.prepare(storage, 'f')).toEqual({ ready: false, reason })
    expect(save).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce()
    expect(rawDraft.observation).toBe('unfinished')
  })
  it('releases freeze on flush failure, blocks in-flight structural edits and detects session removal', async () => {
    const storage = await createStorage(); const release = vi.fn(); const coordinator = new WorkspaceExportCoordinator(() => release)
    const unregister = coordinator.register({ formulaId: 'f', role: 'formula', blockedReason: () => undefined, flush: async () => { throw new Error('save failed') } })
    expect(await coordinator.prepare(storage, 'f')).toEqual({ ready: false, reason: 'flush-failed' })
    expect(coordinator.frozen).toBe(false); expect(release).toHaveBeenCalledOnce(); unregister()
    let finish!: () => void
    const mutation = coordinator.runMutation(() => new Promise<void>(r => { finish = r }))
    expect(await coordinator.prepare(storage, 'f')).toEqual({ ready: false, reason: 'busy' }); finish(); await mutation
    const remove = coordinator.register({ formulaId: 'f', role: 'formula', blockedReason: () => undefined, flush: async () => { remove() } })
    expect(await coordinator.prepare(storage, 'f')).toEqual({ ready: false, reason: 'session-changed' })
  })
})
