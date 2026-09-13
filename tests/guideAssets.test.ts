import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectGuideAsset } from '../scripts/guide-assets.mjs'
import { guideAssetPublicUrl, isSafeGuideAsset, resolveGuideMedia } from '../src/services/guideContracts'
import { validateGuideAssetPath } from '../scripts/guide-assets.mjs'
describe('Guide Phase 3 media', () => {
  it('inspects PNG signature and dimensions', async () => { const dir=await mkdtemp(join(tmpdir(),'guide-')); const file=join(dir,'x.png'); const b=Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.write('IHDR',12); b.writeUInt32BE(1200,16); b.writeUInt32BE(800,20); await writeFile(file,b); await expect(inspectGuideAsset(file)).resolves.toMatchObject({format:'png',width:1200,height:800}); await rm(dir,{recursive:true,force:true}) })
  it('inspects WebP VP8X dimensions and rejects bad signatures', async () => { const dir=await mkdtemp(join(tmpdir(),'guide-')); const file=join(dir,'x.webp'); const b=Buffer.alloc(30); b.write('RIFF',0); b.write('WEBP',8); b.write('VP8X',12); b[24]=99; b[27]=49; await writeFile(file,b); await expect(inspectGuideAsset(file)).resolves.toMatchObject({format:'webp',width:100,height:50}); const bad=join(dir,'bad.webp'); await writeFile(bad,Buffer.from('not-webp')); await expect(inspectGuideAsset(bad)).rejects.toThrow(); await rm(dir,{recursive:true,force:true}) })
  it('accepts only safe PNG/WebP asset references and maps URLs', () => { expect(isSafeGuideAsset('assets/time-machine/en/desktop/save.png')).toBe(true); expect(guideAssetPublicUrl('assets/x.webp')).toBe('/guide/assets/x.webp'); expect(validateGuideAssetPath('../secret.png')).toBe(false); expect(validateGuideAssetPath('C:\\secret.png')).toBe(false); expect(validateGuideAssetPath('assets/x.jpg')).toBe(false) })
  it('returns resolved locale/device diagnostics in fallback order', () => { const media = { figureId: 'x', variants: { ko: { desktop: { src: 'assets/ko.png', alt: 'Korean UI', caption: 'Korean', viewport: 'desktop' } }, en: { mobile: { src: 'assets/en.png', alt: 'English UI', caption: 'English', viewport: 'mobile' } } } }; const result = resolveGuideMedia(media, 'ko', 'mobile'); expect(result).toMatchObject({ resolvedLocale: 'ko', resolvedDevice: 'desktop', usedFallback: true, usedCrossLocaleFallback: false }) })
  it('does not resolve cross-locale media when disabled', () => { const media = { figureId: 'x', allowCrossLocaleFallback: false, variants: { en: { desktop: { src: 'assets/en.png', alt: 'English UI', caption: 'English', viewport: 'desktop' } } } }; expect(resolveGuideMedia(media, 'ko', 'mobile')).toBeUndefined() })
})
