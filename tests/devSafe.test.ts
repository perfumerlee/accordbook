import { describe, expect, it } from 'vitest'
import { classifyRepositoryState, devServerCommand } from '../scripts/dev-safe.mjs'

describe('dev:safe repository state classification', () => {
  it.each([
    [{ ahead: 0, behind: 0 }, 'UP_TO_DATE'], [{ ahead: 0, behind: 1 }, 'BEHIND_ONLY'],
    [{ ahead: 2, behind: 0 }, 'AHEAD_ONLY'], [{ ahead: 1, behind: 1 }, 'DIVERGED'],
    [{ ahead: 0, behind: 0, isDirty: true }, 'DIRTY'], [{ ahead: 0, behind: 0, hasUpstream: false }, 'NO_UPSTREAM'],
    [{ ahead: 0, behind: 0, detached: true }, 'DETACHED'],
  ])('classifies %j as %s', (input, expected) => expect(classifyRepositoryState(input)).toBe(expected))
})

describe('dev:safe server launch command', () => {
  it('uses ComSpec for Windows npm.cmd execution', () => {
    expect(devServerCommand('win32', 'C:\\Windows\\System32\\cmd.exe')).toEqual({ command: 'C:\\Windows\\System32\\cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd run dev'] })
  })
  it('uses npm directly on non-Windows systems', () => {
    expect(devServerCommand('linux')).toEqual({ command: 'npm', args: ['run', 'dev'] })
  })
})
