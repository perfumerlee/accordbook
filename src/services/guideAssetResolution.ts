import type { StagedGuideAsset } from './guideAssetStaging'
export type PublishedGuideAsset = { guidePath: string; mimeType: 'image/png' | 'image/webp'; width: number; height: number }
export type GuideAssetStatus = 'STAGED' | 'PUBLISHED' | 'MISSING' | 'EMPTY'
export function classifyGuideAsset(src: string | undefined, staged: StagedGuideAsset[], published: PublishedGuideAsset[]): GuideAssetStatus { if (!src) return 'EMPTY'; if (published.some(a => a.guidePath === src)) return 'PUBLISHED'; if (staged.some(a => a.guidePath === src)) return 'STAGED'; return 'MISSING' }
export function resolveEditorGuideAsset(src: string | undefined, staged: StagedGuideAsset[], published: PublishedGuideAsset[]) { if (!src) return undefined; const stagedAsset = staged.find(a => a.guidePath === src); if (published.some(a => a.guidePath === src)) return `/guide/${src}`; return stagedAsset ? `/api/guide-assets/${encodeURIComponent(stagedAsset.stagedAssetId)}` : undefined }
