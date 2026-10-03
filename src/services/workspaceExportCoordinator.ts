import type { AccordbookStorage } from '../storage/storageService'
import type { WorkspaceSource } from './workspaceExport'
import { collectWorkspace } from './workspaceCollector'
import { profileWorkspaceAsync } from './workspaceProfile'

export type WorkspaceBlockReason = 'unsaved-experiment-draft' | 'unsaved-branch-intent' | 'unfinished-structural-edit' | 'unfinished-version-draft'
export interface WorkspaceExportParticipant {
  formulaId: string
  role: 'formula' | 'experiment' | 'draft' | 'version'
  blockedReason(): WorkspaceBlockReason | undefined
  flush(): Promise<void>
}
export type WorkspacePreparationResult = { ready: true; workspace: WorkspaceSource; serialized: string; persistence: 'indexeddb' | 'memory' }
  | { ready: false; reason: WorkspaceBlockReason | 'busy' | 'editor-unavailable' | 'session-changed' | 'flush-failed' | 'formula-not-found' | 'invalid-workspace-graph' | 'storage-read-failed'; diagnostic?: { path: string; reason: string } }

/** Per Notebook editing session. No timer delays or cross-tab/global lock. */
export class WorkspaceExportCoordinator {
  private participants = new Set<WorkspaceExportParticipant>()
  private generation = 0
  private preparing = false
  private operations = 0
  get frozen() { return this.preparing }
  constructor(private readonly freeze: () => () => void = () => () => undefined) {}
  register(participant: WorkspaceExportParticipant): () => void {
    this.participants.add(participant); this.generation++
    return () => { this.participants.delete(participant); this.generation++ }
  }
  /** Track already-running structural operations, including their pre-write crypto awaits. */
  async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.preparing) throw new Error('Workspace export is preparing')
    this.operations++
    try { return await operation() } finally { this.operations-- }
  }
  async prepare(storage: AccordbookStorage, formulaId: string): Promise<WorkspacePreparationResult> {
    if (this.preparing || this.operations) return { ready: false, reason: 'busy' }
    this.preparing = true
    let release: (() => void) | undefined
    try {
      release = this.freeze()
      const generation = this.generation
      const participants = [...this.participants].filter(p => p.formulaId === formulaId)
      if (!participants.some(p => p.role === 'formula')) return { ready: false, reason: 'editor-unavailable' }
      const blocked = () => participants.map(p => p.blockedReason()).find(Boolean)
      const reason = blocked()
      if (reason) return { ready: false, reason }
      // Formula includes both its save queue and provenance queue, before Experiment flush.
      for (const p of participants.filter(p => p.role === 'formula')) await profileWorkspaceAsync('formula-provenance-flush', () => p.flush())
      for (const p of participants.filter(p => p.role !== 'formula')) await profileWorkspaceAsync(`${p.role}-flush`, () => p.flush())
      if (generation !== this.generation) return { ready: false, reason: 'session-changed' }
      const afterFlush = blocked()
      if (afterFlush) return { ready: false, reason: afterFlush }
      const collected = await collectWorkspace(storage, formulaId)
      if (generation !== this.generation) return { ready: false, reason: 'session-changed' }
      return collected.ok ? { ready: true, workspace: collected.workspace, serialized: collected.serialized, persistence: storage.mode }
        : { ready: false, reason: collected.code, diagnostic: collected.diagnostic }
    } catch { return { ready: false, reason: 'flush-failed' } }
    finally { try { release?.() } finally { this.preparing = false } }
  }
}

export function prepareWorkspaceForExport(storage: AccordbookStorage, formulaId: string, coordinator: WorkspaceExportCoordinator) {
  return coordinator.prepare(storage, formulaId)
}

/** Serializes saves and exposes the in-flight tail even after pending refs are cleared. */
export class WorkspaceWriteQueue {
  private tail: Promise<unknown> = Promise.resolve()
  enqueue<T>(write: () => Promise<T>): Promise<T> {
    const next = this.tail.catch(() => undefined).then(write)
    this.tail = next
    void next.catch(() => undefined) // Callers may use autosave fire-and-forget; drain still observes failure.
    return next
  }
  async drain(): Promise<void> { await this.tail }
}

/** Synchronous DOM freeze covers the Notebook and its portals; release restores prior state. */
export function freezeNotebookEditing(): () => void {
  const body = document.body
  const previous = body.inert
  const focused = document.activeElement as HTMLElement | null
  body.inert = true
  const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
  const events = ['beforeinput', 'input', 'change', 'click', 'keydown', 'submit', 'pointerdown']
  events.forEach(name => document.addEventListener(name, block, true))
  return () => {
    events.forEach(name => document.removeEventListener(name, block, true))
    body.inert = previous
    if (focused?.isConnected && !previous) focused.focus({ preventScroll: true })
  }
}
