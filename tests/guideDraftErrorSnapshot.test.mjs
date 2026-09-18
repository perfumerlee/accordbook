import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { forwardGuideDraft } from '../scripts/guide-draft-proxy.mjs'
import { createDraftErrorSnapshotWriter } from '../scripts/guide-draft-error-snapshot.mjs'

let root, path, writer
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'guide-error-'))
  path = join(root, 'local', 'guide-draft-last-error.json')
  writer = createDraftErrorSnapshotWriter(path)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
const request = JSON.stringify({ action: 'saveDraft', operatorKey: 'PRIVATE_KEY', document: { text: 'PRIVATE_CONTENT' } })
const fetchError = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, code: 'INVALID_DRAFT', reason: 'INVALID_DOCUMENT', token: 'PRIVATE_TOKEN' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))

it('writes safe fields and a fresh timestamp for failed saveDraft, excluding secrets', async () => {
  const start = Date.now()
  const result = await forwardGuideDraft('https://example.test/exec', request, fetchError(), writer)
  expect(result.status).toBe(200)
  const raw = await readFile(path, 'utf8'), snapshot = JSON.parse(raw)
  expect(snapshot).toMatchObject({ action: 'saveDraft', localStatus: 200, upstreamReached: true, upstreamStatus: 500, contentType: 'application/json', safeJson: true, code: 'INVALID_DRAFT', reason: 'INVALID_DOCUMENT', stage: 'exec', redirect: false })
  expect(Date.parse(snapshot.timestamp)).toBeGreaterThanOrEqual(start)
  expect(raw).not.toContain('PRIVATE')
  expect(Object.keys(snapshot).sort()).toEqual(['action', 'localStatus', 'upstreamReached', 'upstreamStatus', 'contentType', 'safeJson', 'code', 'reason', 'stage', 'redirect', 'timestamp'].sort())
})
it('does not create or modify a snapshot on success and overwrites on the next failure', async () => {
  const success = () => vi.fn().mockResolvedValue(new Response('{"ok":true}'))
  await forwardGuideDraft('https://example.test/exec', request, success(), writer)
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  await forwardGuideDraft('https://example.test/exec', request, fetchError(), writer)
  const previous = await readFile(path, 'utf8')
  await forwardGuideDraft('https://example.test/exec', request, success(), writer)
  expect(await readFile(path, 'utf8')).toBe(previous)
  await forwardGuideDraft('https://example.test/exec', '{"action":"getDraft"}', vi.fn().mockResolvedValue(new Response('PRIVATE_HTML', { status: 500, headers: { 'Content-Type': 'text/html' } })), writer)
  const next = JSON.parse(await readFile(path, 'utf8'))
  expect(next).toMatchObject({ action: 'getDraft', safeJson: false, localStatus: 502 })
  expect(next).not.toHaveProperty('reason')
})
it('keeps exception contents private and preserves the original exception', async () => {
  const error = new TypeError('PRIVATE_STACK')
  await expect(forwardGuideDraft('https://example.test/exec', request, vi.fn().mockRejectedValue(error), writer)).rejects.toBe(error)
  const raw = await readFile(path, 'utf8')
  expect(JSON.parse(raw)).toMatchObject({ action: 'saveDraft', upstreamReached: false, exceptionCategory: 'TypeError' })
  expect(raw).not.toContain('PRIVATE')
})
