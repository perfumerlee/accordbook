import { afterEach, expect, it, vi } from 'vitest'
import type { GuideDocument } from '../src/models/guide'
import { publicationAssetCheck, guardPublicationAssets } from '../src/services/guidePublicationAssets'
import type { StagedGuideAsset, PublishedGuideAsset } from '../src/services/guideAssetStaging'
const a = 'assets/getting-started/en/desktop/image-abc12345.png'
const b = 'assets/getting-started/en/desktop/existing.png'
const doc = (...refs: string[]) => ({ guideId:'getting-started', blocks: refs.map(src => ({ type: 'screenshot', media: { variants: { en: { desktop: { src } } } } })) }) as GuideDocument
const staged = (guidePath: string) => ({ guidePath }) as StagedGuideAsset
const published = (guidePath: string) => ({ guidePath }) as PublishedGuideAsset
afterEach(() => vi.unstubAllGlobals())
it('allows staged references subject to local byte readiness', () => {
  expect(publicationAssetCheck(doc(a), [staged(a)], [])).toMatchObject({ hasUnpublishedStagedAssets: true, stagedCount: 1, reason: undefined })
})
it('ignores unused staging objects', () => expect(publicationAssetCheck(doc(b), [staged(a)], [published(b)]).reason).toBeUndefined())
it('allows published-only references', () => expect(publicationAssetCheck(doc(b), [], [published(b)]).reason).toBeUndefined())
it('published existence takes precedence over staging', () => expect(publicationAssetCheck(doc(a), [staged(a)], [published(a)]).hasUnpublishedStagedAssets).toBe(false))
it('counts unique staged references', () => expect(publicationAssetCheck(doc(a, a, b), [staged(a), staged(b)], []).stagedCount).toBe(2))
it('blocks missing references', () => expect(publicationAssetCheck(doc(a), [], []).reason).toContain('MISSING'))
it('calls publisher when staged bytes pass local readiness', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, assets: url === '/api/guide-assets' ? [staged(a)] : [] }))))
  const publish = vi.fn(), blocked = vi.fn()
  await guardPublicationAssets(doc(a), publish, blocked)
  expect(publish).toHaveBeenCalledOnce()
  expect(blocked).not.toHaveBeenCalled()
})
it('fails closed on unavailable catalogs', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const publish = vi.fn(), blocked = vi.fn()
  await guardPublicationAssets(doc(a), publish, blocked)
  expect(publish).not.toHaveBeenCalled()
  expect(blocked).toHaveBeenCalledWith(expect.stringContaining('unavailable'))
})
it('preserves publisher invocation for published references', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, assets: url === '/api/guide-assets' ? [] : [published(b)] }))))
  const publish = vi.fn().mockResolvedValue({ ok: true })
  await guardPublicationAssets(doc(b), publish, vi.fn())
  expect(publish).toHaveBeenCalledOnce()
})
