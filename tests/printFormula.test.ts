import { describe, expect, it, vi } from 'vitest'
import { printCurrentFormula } from '../src/services/printFormula'

describe('print service', () => {
  it('calls browser print when available', () => { const print = vi.fn(); vi.stubGlobal('window', { print }); expect(printCurrentFormula()).toBe(true); expect(print).toHaveBeenCalledOnce(); vi.unstubAllGlobals() })
  it('gracefully reports unavailable print environments', () => { vi.stubGlobal('window', {}); expect(printCurrentFormula()).toBe(false); vi.unstubAllGlobals() })
})
