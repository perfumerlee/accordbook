import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { deleteStagedGuideAsset, listStagedGuideAssets, maxBytes, readStagedGuideAsset, setStagingRootForTests, stageGuideAsset, markPublishedAssets } from '../scripts/guide-asset-staging.mjs'
async function fixture(format) { return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 20, g: 80, b: 140 } } }).toFormat(format).toBuffer() }
async function withStore(fn) { const root = await mkdtemp(join(tmpdir(), 'accordbook-stage-')); setStagingRootForTests(root); try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) } }
describe('private guide asset staging', () => {
  it('deduplicates to an existing readable ID and marks only matching published content', async () => withStore(async () => {
    const bytes=await fixture('png'), input={guideId:'time-machine',locale:'en',device:'desktop',mimeType:'image/png',bytes};
    const first=await stageGuideAsset(input), second=await stageGuideAsset(input), unrelated=await stageGuideAsset({...input,locale:'ko'});
    expect(second.stagedAssetId).toBe(first.stagedAssetId); expect((await readStagedGuideAsset(second.stagedAssetId)).bytes).toEqual(bytes);
    await markPublishedAssets([{guidePath:first.guidePath,sha256:first.sha256}], 'a'.repeat(40));
    expect((await listStagedGuideAssets()).find(a=>a.stagedAssetId===first.stagedAssetId).publishedCommit).toBe('a'.repeat(40));
    expect((await listStagedGuideAssets()).find(a=>a.stagedAssetId===unrelated.stagedAssetId).publishedCommit).toBeUndefined();
    expect((await readStagedGuideAsset(first.stagedAssetId)).bytes).toEqual(bytes);
  }))
  it('rejects a symlink substituted for an immutable staged file', async context => withStore(async root => {
    const bytes=await fixture('png'), a=await stageGuideAsset({guideId:'time-machine',locale:'en',device:'desktop',mimeType:'image/png',bytes});
    const target=join(root,'outside.png'), file=join(root,'files',a.stagedAssetId+'.png');await writeFile(target,bytes);await rm(file);
    try { await symlink(target,file,'file') } catch(e) { if(['EPERM','EACCES'].includes(e.code)){context.skip();return}throw e }
    await expect(readStagedGuideAsset(a.stagedAssetId)).rejects.toThrow('STAGED_FILE_CORRUPTED');
  }))
  it('stages PNG with safe deterministic metadata and exact SHA', async () => await withStore(async root => { const bytes = await fixture('png'), asset = await stageGuideAsset({ guideId: 'time-machine', locale: 'en', device: 'desktop', mimeType: 'image/png', bytes, originalFileName: '../../evil.png' }); expect(asset.guidePath).toBe(`assets/time-machine/en/desktop/image-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.png`); expect(asset.originalFileName).toBe('../../evil.png'); expect(asset.stagedAssetId).not.toContain('..'); expect(await readFile(join(root, 'files', `${asset.stagedAssetId}.png`))).toEqual(bytes); expect((await listStagedGuideAssets()).length).toBe(1) }))
  it('stages WebP and reloads the manifest from disk', async () => await withStore(async root => { const bytes = await fixture('webp'), asset = await stageGuideAsset({ guideId: 'time-machine', locale: 'ko', device: 'mobile', mimeType: 'image/webp', bytes }); setStagingRootForTests(root); expect((await listStagedGuideAssets())[0].stagedAssetId).toBe(asset.stagedAssetId); expect((await readStagedGuideAsset(asset.stagedAssetId)).bytes).toEqual(bytes) }))
  it('rejects invalid context, MIME spoofing, and oversized data', async () => await withStore(async () => { const png = await fixture('png'); await expect(stageGuideAsset({ guideId: 'unknown', locale: 'en', device: 'desktop', mimeType: 'image/png', bytes: png })).rejects.toThrow('INVALID_GUIDE_ID'); await expect(stageGuideAsset({ guideId: 'time-machine', locale: 'en', device: 'desktop', mimeType: 'image/webp', bytes: png })).rejects.toThrow('INVALID_IMAGE'); await expect(stageGuideAsset({ guideId: 'time-machine', locale: 'en', device: 'desktop', mimeType: 'image/png', bytes: Buffer.alloc(maxBytes + 1) })).rejects.toThrow('IMAGE_TOO_LARGE') }))
  it('detects corruption, missing files, and deletes by opaque id only', async () => await withStore(async root => { const bytes = await fixture('png'), asset = await stageGuideAsset({ guideId: 'time-machine', locale: 'en', device: 'desktop', mimeType: 'image/png', bytes }); const file = join(root, 'files', `${asset.stagedAssetId}.png`); await writeFile(file, Buffer.from('bad')); await expect(readStagedGuideAsset(asset.stagedAssetId)).rejects.toThrow('STAGED_FILE_CORRUPTED'); await rm(file); await expect(readStagedGuideAsset(asset.stagedAssetId)).rejects.toThrow('STAGED_FILE_MISSING'); await expect(deleteStagedGuideAsset('../escape')).rejects.toThrow('STAGED_ASSET_NOT_FOUND') }))
})
