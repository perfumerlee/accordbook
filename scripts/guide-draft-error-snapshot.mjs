import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Input is the proxy's allowlisted diagnostic, never a request or raw response.
export function createDraftErrorSnapshotWriter(path = resolve('.guide-staging/guide-draft-last-error.json')) {
  let pending = Promise.resolve()
  return diagnostic => {
    const snapshot = JSON.stringify({ ...diagnostic, timestamp: new Date().toISOString() }, null, 2)
    pending = pending.then(async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, snapshot + '\n', { encoding: 'utf8', mode: 0o600 })
    }).catch(() => {
      // Diagnostics must never turn a completed request into a failure or retry.
      console.warn('[guide-draft-proxy] SNAPSHOT_WRITE_FAILED')
    })
    return pending
  }
}

export const writeDraftErrorSnapshot = createDraftErrorSnapshotWriter()
