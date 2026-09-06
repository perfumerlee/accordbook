import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBuyerPhone, validateBuyerPhone, generateBuyerPin, registerPaidFormula } from '../src/services/paidFormulaRegistry'
import { verifyPaidFormula } from '../src/services/paidFormulaRegistry'

afterEach(() => vi.restoreAllMocks())
describe('Paid Formula registration', () => {
  it('buyer verification requires a matching server acknowledgement and fails closed', async () => {
    const buyer = { name: ' Buyer ', phoneLast4: '0012', pin: '000123' }
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, packageId: 'id' })))
    await verifyPaidFormula('id', buyer)
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({ action: 'verify', packageId: 'id', buyerName: 'Buyer', phoneLast4: '0012', pin: '000123' })
    for (const result of [{ ok: false }, { ok: true, packageId: 'other' }]) {
      fetcher.mockResolvedValue(new Response(JSON.stringify(result)))
      await expect(verifyPaidFormula('id', buyer)).rejects.toThrow()
    }
    fetcher.mockRejectedValue(new TypeError('Offline'))
    await expect(verifyPaidFormula('id', buyer)).rejects.toThrow()
  })
  it('formats phone input and validates full 010 numbers', () => {
    expect(formatBuyerPhone('01012340012')).toBe('010-1234-0012')
    expect(formatBuyerPhone('010-1234-0012')).toBe('010-1234-0012')
    expect(formatBuyerPhone('0101')).toBe('010-1')
    expect(validateBuyerPhone('01012340012')).toBe('010-1234-0012')
    for (const phone of ['01112345678', '0101234567', '010123456789', '010-123-45678', 'garbage']) expect(() => validateBuyerPhone(phone)).toThrow()
  })
  it('preserves leading zero PINs and rejects biased random samples', () => {
    const random = vi.spyOn(crypto, 'getRandomValues')
    random.mockImplementationOnce((array: any) => { array[0] = 4294967295; return array })
    random.mockImplementationOnce((array: any) => { array[0] = 123; return array })
    expect(generateBuyerPin()).toBe('000123')
    expect(random).toHaveBeenCalledTimes(2)
  })
  it('requires an acknowledged package ID and never uses no-cors', async () => {
    const record = { packageId: 'test-id', buyerName: 'Buyer', phone: '01012340012', pin: '000123', productName: 'Pack' }
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, packageId: 'test-id' })))
    const endpoint = 'https://script.google.com/macros/s/DEPLOYMENT/exec'
    await registerPaidFormula(endpoint, 'x'.repeat(32), record)
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).phone).toBe('010-1234-0012')
    expect(fetcher.mock.calls[0][1]?.mode).not.toBe('no-cors')
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ok: true, packageId: 'wrong' })))
    await expect(registerPaidFormula(endpoint, 'x'.repeat(32), record)).rejects.toThrow()
    await expect(registerPaidFormula('https://example.com', 'x'.repeat(32), record)).rejects.toThrow()
  })
})
