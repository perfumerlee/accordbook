import { describe, expect, it } from 'vitest'
import { dropResponseText } from '../src/services/dropResponseText'
describe('bounded Drop responses', () => {
  it('reads valid UTF-8', async () => { expect(await dropResponseText(new Response('포뮬러'), 20)).toBe('포뮬러') })
  it('bounds actual bytes without Content-Length', async () => { await expect(dropResponseText(new Response('포뮬러'), 4)).rejects.toThrow('package_too_large') })
  it('rejects advertised oversized responses', async () => { await expect(dropResponseText(new Response('x', {headers:{'content-length':'100'}}), 4)).rejects.toThrow('package_too_large') })
})
