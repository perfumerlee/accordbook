import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { listStagedGuideAssets, readStagedGuideAsset } from './guide-asset-staging.mjs'
import { listPublishedGuideAssets } from './guide-asset-catalog.mjs'

export const MAX_NEW_ASSET_BYTES = 5000000
export const MAX_PUBLISH_REQUEST_BYTES = 6779294

const GUIDE_IDS = new Set([
  'getting-started',
  'formula-basics',
  'time-machine',
  'experiments',
  'formula-drop',
  'import-export',
  'data-backup',
  'faq',
])

export function assetReferences(document) {
  const paths = new Set()
  for (const b of document.blocks ?? [])
    for (const locale of Object.values(b.media?.variants ?? {}))
      for (const v of Object.values(locale ?? {}))
        if (v?.src) paths.add(v.src)
  return [...paths].sort()
}

export function canonicalAssetPath(path, guideId) {
  if (!GUIDE_IDS.has(guideId)) throw Error('INVALID_GUIDE_ID')
  const m = /^assets\/([a-z0-9-]+)\/(en|ko)\/(desktop|tablet|mobile)\/([a-z0-9][a-z0-9-]*\.(png|webp))$/.exec(path)
  if (!m) throw Error('ASSET_PATH_INVALID')
  if (m[1] !== guideId) throw Error('ASSET_GUIDE_MISMATCH')
  return path
}

function pngDimensions(bytes) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mimeType: 'image/png' }
  }
}

function webpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) return

  const kind = bytes.toString('ascii', 12, 16)
  if (kind === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    return { width, height, mimeType: 'image/webp' }
  }
  if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
      mimeType: 'image/webp',
    }
  }
  if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      mimeType: 'image/webp',
    }
  }
}

async function readLocalGuideAsset(guidePath) {
  const file = resolve(process.cwd(), 'content/guide', guidePath)
  let bytes
  try {
    bytes = await readFile(file)
  } catch {
    return undefined
  }

  const meta = pngDimensions(bytes) ?? webpDimensions(bytes)
  if (!meta || !meta.width || !meta.height) throw Error('ASSET_DECODE_FAILED')

  return {
    asset: {
      guidePath,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    bytes,
  }
}

export async function collectPublishBundle(
  document,
  deps = {
    listStagedGuideAssets,
    readStagedGuideAsset,
    listPublishedGuideAssets,
    readLocalGuideAsset,
  },
) {
  const staged = await deps.listStagedGuideAssets()
  const published = await deps.listPublishedGuideAssets()
  const bundle = []
  let total = 0

  for (const path of assetReferences(document)) {
    canonicalAssetPath(path, document.guideId)

    // A local catalog entry is not proof that the asset already exists on
    // GitHub HEAD. Prefer real bytes whenever they are available so the
    // Apps Script preflight can compare them against the pinned tree.
    const candidates = staged.filter(a => a.guidePath === path)
    const canReadLocal = typeof deps.readLocalGuideAsset === 'function'

    // Backward-compatible injected dependencies may not provide the local
    // source reader. In that reduced capability mode, the published catalog
    // remains the only available evidence and can safely short-circuit.
    // Production uses the full default dependency set below and therefore
    // still prefers real staged/local bytes for server-side HEAD preflight.
    if (!canReadLocal && published.some(a => a.guidePath === path)) continue

    let source
    if (candidates.length) {
      source = await deps.readStagedGuideAsset(candidates[0].stagedAssetId)
    } else if (canReadLocal) {
      source = await deps.readLocalGuideAsset(path)
    }

    // Only trust the local published catalog as a fallback when this
    // machine no longer has the source bytes. The server still verifies
    // that the referenced path exists in the pinned GitHub tree.
    if (!source && published.some(a => a.guidePath === path)) continue
    if (!source) throw Error('STAGED_ASSET_REQUIRED')

    const { asset, bytes } = source
    total += bytes.length
    if (total > MAX_NEW_ASSET_BYTES) throw Error('ASSET_AGGREGATE_TOO_LARGE')
    if (bundle.length >= 64) throw Error('ASSET_AGGREGATE_TOO_LARGE')

    bundle.push({
      guidePath: path,
      mimeType: asset.mimeType,
      size: bytes.length,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      base64: bytes.toString('base64'),
    })
  }

  return bundle
}
