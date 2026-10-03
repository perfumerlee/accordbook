/** Opt-in local QA instrumentation. Names/durations only; no content or network output. */
let observer: ((stage: string, milliseconds: number) => void) | undefined
export function observeWorkspaceProfile(next?: typeof observer) { observer = next }
export function workspaceProfileEnabled() { return !!observer }
export function reportWorkspaceProfile(stage: string, milliseconds: number) { observer?.(stage, milliseconds) }
export function profileWorkspace<T>(stage: string, work: () => T): T {
  if (!observer) return work()
  const start = performance.now()
  try { return work() } finally { observer?.(stage, performance.now() - start) }
}
export async function profileWorkspaceAsync<T>(stage: string, work: () => Promise<T>): Promise<T> {
  if (!observer) return work()
  const start = performance.now()
  try { return await work() } finally { observer?.(stage, performance.now() - start) }
}
