import { execFileSync, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function classifyRepositoryState({ ahead = 0, behind = 0, isDirty = false, hasUpstream = true, detached = false }) {
  if (detached) return 'DETACHED'
  if (!hasUpstream) return 'NO_UPSTREAM'
  if (isDirty) return 'DIRTY'
  if (ahead > 0 && behind > 0) return 'DIVERGED'
  if (ahead > 0) return 'AHEAD_ONLY'
  if (behind > 0) return 'BEHIND_ONLY'
  return 'UP_TO_DATE'
}

const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fail = (message, error) => { console.error(`[dev:safe] ${message}`); if (error?.stderr) console.error(String(error.stderr).trim()); process.exitCode = 1 }

function run() {
  try { git(['rev-parse', '--show-toplevel']) } catch (error) { fail('This directory is not a Git repository.', error); return }
  console.log('[dev:safe] Fetching origin...')
  try { execFileSync('git', ['fetch', 'origin'], { stdio: 'inherit' }) } catch (error) { fail('Fetch failed. The dev server was not started.', error); return }
  let branch, upstream, status, counts
  try { branch = git(['symbolic-ref', '--short', 'HEAD']) } catch (error) { fail('Detached HEAD detected. Resolve the Git state manually.', error); return }
  try { upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) } catch (error) { fail('No upstream branch is configured. The dev server was not started.', error); return }
  try {
    status = git(['status', '--porcelain'])
    counts = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).split(/\s+/).map(Number)
  } catch (error) { fail('Could not determine the repository state. The dev server was not started.', error); return }
  const [ahead, behind] = counts
  const state = classifyRepositoryState({ ahead, behind, isDirty: Boolean(status), hasUpstream: Boolean(upstream) })
  console.log(`[dev:safe] Working tree ${status ? 'has local changes' : 'clean'}.`)
  console.log(`[dev:safe] Branch: ${branch}`)
  console.log(`[dev:safe] Upstream: ${upstream}`)
  if (state === 'DIRTY') return fail('Local changes detected. Automatic sync stopped to protect your work. Review `git status` before continuing.')
  if (state === 'AHEAD_ONLY') return fail('Local branch is ahead of its upstream. No automatic Git action was performed. Review the repository state manually.')
  if (state === 'DIVERGED') return fail('Local and remote branches have diverged. Automatic synchronization was stopped. Resolve the Git state manually.')
  if (state === 'BEHIND_ONLY') {
    console.log(`[dev:safe] Remote updates found: ${behind} commit${behind === 1 ? '' : 's'}.`)
    console.log('[dev:safe] Fast-forwarding local branch...')
    try { execFileSync('git', ['pull', '--ff-only'], { stdio: 'inherit' }) } catch (error) { return fail('Fast-forward failed. The dev server was not started.', error) }
    console.log('[dev:safe] Local repository synchronized.')
  } else console.log('[dev:safe] Repository is already up to date.')
  console.log('[dev:safe] Starting Accordbook dev server...')
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], { stdio: 'inherit' })
  child.on('error', error => fail('Could not start the existing dev server.', error))
  child.on('exit', (code, signal) => { if (signal) process.exitCode = 1; else process.exitCode = code ?? 1 })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run()
