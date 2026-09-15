export type StagedGuideAsset = { stagedAssetId: string; guideId: string; guidePath: string; mimeType: 'image/png' | 'image/webp'; extension: 'png' | 'webp'; size: number; width: number; height: number; sha256: string; createdAt: string; originalFileName?: string }
export type PublishedGuideAsset = { guidePath: string; mimeType: 'image/png' | 'image/webp'; width: number; height: number }
const endpoint = '/api/guide-assets'
const stagedByPath = new Map<string, StagedGuideAsset>()
export async function stageGuideAsset(file: File, guideId: string, locale: 'en' | 'ko', device: 'desktop' | 'tablet' | 'mobile', role = 'image') { const form = new FormData(); form.append('file', file, file.name); form.append('guideId', guideId); form.append('locale', locale); form.append('device', device); form.append('role', role); const response = await fetch(endpoint, { method: 'POST', body: form }); return await response.json() as { ok: boolean; asset?: StagedGuideAsset; code?: string } }
export async function listStagedGuideAssets() { const result = await (await fetch(endpoint, { cache: 'no-store' })).json() as { ok: boolean; assets?: StagedGuideAsset[]; code?: string }; if (result.ok) { stagedByPath.clear(); for (const asset of result.assets ?? []) stagedByPath.set(asset.guidePath, asset) } return result }
export function stagedGuideAssetPreviewUrl(id: string) { return `${endpoint}/${encodeURIComponent(id)}` }
export function stagedGuideAssetPreviewForPath(src: string) { const asset = stagedByPath.get(src); return asset ? stagedGuideAssetPreviewUrl(asset.stagedAssetId) : undefined }
export function hasStagedGuideAssetPath(src: string) { return stagedByPath.has(src) }
export async function listPublishedGuideAssets() { const response = await fetch('/api/guide-asset-catalog', { cache: 'no-store' }); const result = await response.json() as { ok: boolean; assets?: PublishedGuideAsset[]; code?: string }; return response.ok ? result : { ok: false, code: result.code ?? 'CATALOG_FAILED' } }
export async function deleteStagedGuideAsset(id: string) { return await (await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: 'DELETE' })).json() as { ok: boolean; code?: string } }
