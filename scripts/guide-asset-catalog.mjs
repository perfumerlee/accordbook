import { readdir } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { inspectGuideAsset } from './guide-assets.mjs'
import { listStagedGuideAssets, readStagedGuideAsset } from './guide-asset-staging.mjs'
export async function listPublishedGuideAssets(root = resolve(process.cwd(), 'content/guide/assets')) {
  const result = []
  async function walk(dir) { let entries; try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }; for (const entry of entries) { const file = resolve(dir, entry.name); if (entry.isDirectory()) await walk(file); else if (entry.isFile() && /\.(png|webp)$/i.test(entry.name)) { try { const info = await inspectGuideAsset(file); const rel = relative(root, file).split(sep).join('/'); result.push({ guidePath: `assets/${rel}`, mimeType: info.mimeType, width: info.width, height: info.height }) } catch {} } } }
  await walk(resolve(root));
  for (const a of await listStagedGuideAssets()) if (/^[0-9a-f]{40}$/.test(a.publishedCommit ?? '') && !result.some(p => p.guidePath === a.guidePath)) {
    await readStagedGuideAsset(a.stagedAssetId)
    result.push({ guidePath: a.guidePath, mimeType: a.mimeType, width: a.width, height: a.height })
  }
  return result.sort((a, b) => a.guidePath.localeCompare(b.guidePath))
}
