import { createWorkspaceProcessor, type WorkspaceTask } from './workspacePipeline'
import type { WorkspaceWorkerResponse } from './workspaceExecution'
import { observeWorkspaceProfile } from './workspaceProfile'
const process = createWorkspaceProcessor()
let tail = Promise.resolve()
self.onmessage = (event: MessageEvent<{ id: number; task: WorkspaceTask; profile?: boolean }>) => {
  const { id, task } = event.data
  tail = tail.then(async () => {
    let response: WorkspaceWorkerResponse
    const timings: { stage: string; ms: number }[] = []
    if (event.data.profile) observeWorkspaceProfile((stage, ms) => timings.push({ stage, ms }))
    try { response = { id, result: await process(task) } }
    catch (error) {
      const e = error as { name?: string; code?: string; path?: string; reason?: string }
      response = { id, error: { name: e.name ?? 'Error', code: e.code, path: e.path, reason: e.reason } }
    }
    observeWorkspaceProfile()
    if (event.data.profile) response.timings = timings
    self.postMessage(response)
  })
}
