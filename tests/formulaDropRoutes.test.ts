import { describe, expect, it } from 'vitest'
import { resolveAccordbookRoute } from '../src/services/formulaDropRoutes'
describe('Formula Drop routes', () => {
  it.each(['/'])('keeps the root route', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'root' }))
  it.each(['/drop', '/drop/'])('resolves the index route', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'drop-index' }))
  it.each(['/drop/2026-001', '/drop/2026-001/'])('derives canonical detail ID', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'drop-detail', slug: '2026-001', dropId: 'DROP-2026-001' }))
  it.each(['/drop/26-001', '/drop/2026-1', '/drop/DROP-2026-001', '/drop/2026-0000', '/drop/foo', '/admin'])('rejects malformed routes', path => expect(resolveAccordbookRoute(path).kind).toBe('unknown'))
})
