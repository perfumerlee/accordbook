import type { GuideDocument } from '../models/guide'
const OPERATOR_KEY_STORAGE = 'accordbook.guide.operatorKey'
export function readStoredOperatorKey() { try { return typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(OPERATOR_KEY_STORAGE) ?? '' } catch { return '' } }
export function clearStoredOperatorKey() { try { sessionStorage.removeItem(OPERATOR_KEY_STORAGE) } catch {} }
function storeOperatorKey(key: string) { try { sessionStorage.setItem(OPERATOR_KEY_STORAGE, key) } catch {} }

export type GuideDraftEnvelope = { format: 'accordbook-guide-draft'; formatVersion: 1; guideId: string; revision: number; updatedAt: string; basePublishedFingerprint: string; document: GuideDocument }
export type GuideDraftMeta = Pick<GuideDraftEnvelope, 'revision' | 'updatedAt' | 'basePublishedFingerprint'>
export type GuideDraftResult = { ok: true; draft?: GuideDraftEnvelope; revisions?: GuideDraftMeta[]; revision?: number; updatedAt?: string; guideId?: string; commitSha?: string; publishedAt?: string; stagingWarning?: string; publishedFingerprint?: string; draftRevisionAfterPublish?: number } | { ok: false; code: 'ASSET_PUBLISH_NOT_DEPLOYED' | 'STAGED_ASSET_REQUIRED' | 'EXTRA_STAGED_ASSET' | 'ASSET_PATH_INVALID' | 'ASSET_GUIDE_MISMATCH' | 'ASSET_UNSUPPORTED_TYPE' | 'ASSET_TOO_LARGE' | 'ASSET_AGGREGATE_TOO_LARGE' | 'ASSET_DECODE_FAILED' | 'ASSET_MIME_MISMATCH' | 'ASSET_DIMENSION_INVALID' | 'ASSET_HASH_MISMATCH' | 'ASSET_PATH_CONFLICT' | 'STAGED_FILE_MISSING' | 'STAGED_FILE_CORRUPTED' | 'AUTH_FAILED' | 'NO_DRAFT' | 'REVISION_CONFLICT' | 'INVALID_DRAFT' | 'REVISION_NOT_FOUND' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'PUBLISHED_SOURCE_CHANGED' | 'UNPUBLISHED_ASSET_REFERENCE' | 'GITHUB_AUTH_FAILED' | 'GITHUB_SOURCE_NOT_FOUND' | 'PUBLISH_CONFLICT' | 'GITHUB_WRITE_FAILED' | 'PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED'; message?: string; currentRevision?: number; assetPaths?: string[] }
export type GuideDraftClient = { connect(key: string): Promise<boolean>; getDraft(guideId: string): Promise<GuideDraftResult>; listDraftRevisions(guideId: string): Promise<GuideDraftResult>; getDraftRevision(guideId: string, revision: number): Promise<GuideDraftResult>; saveDraft(guideId: string, expectedRevision: number | null, basePublishedFingerprint: string, document: GuideDocument): Promise<GuideDraftResult>; deleteDraft(guideId: string): Promise<GuideDraftResult> }
export type GuidePublishCapabilities = { ok: true; assetPublishProtocol: 1; atomicAssetPublish: true; serverAssetValidation: true; singleCommit: true } | { ok: false; code: 'ASSET_PUBLISH_NOT_DEPLOYED' | 'AUTH_FAILED' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE'; message?: string }
export async function checkGuideAtomicPublishProtocol(guideId = 'getting-started'): Promise<GuidePublishCapabilities> {
  const result = await requestGuideDraftAction('prepareAssetPublish', { guideId })
  if (!result.ok) return result as GuidePublishCapabilities
  const value = result as unknown as Record<string, unknown>
  if (value.assetPublishProtocol !== 1 || !value.draft || typeof value.draft !== 'object') return { ok: false, code: 'ASSET_PUBLISH_NOT_DEPLOYED' }
  return { ok: true, assetPublishProtocol: 1, atomicAssetPublish: true, serverAssetValidation: true, singleCommit: true }
}
const configuredEndpoint = (import.meta.env.VITE_GUIDE_DRAFT_ENDPOINT ?? '').trim()
const endpoint = import.meta.env.DEV ? '/api/guide-drafts' : configuredEndpoint
let operatorKey = ''
export function guideDraftConnected() { return Boolean(operatorKey) }
export function createGuideDraftRequest(action: string, payload: Record<string, unknown>, key: string, signal?: AbortSignal): RequestInit { return { method: 'POST', body: JSON.stringify({ action, ...payload, operatorKey: key }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, credentials: 'omit', redirect: 'follow', signal } }
export async function requestGuideDraft(url: string, action: string, payload: Record<string, unknown>, key: string): Promise<GuideDraftResult> {
  if (!url || !key) return { ok: false, code: 'NETWORK_ERROR' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, createGuideDraftRequest(action, payload, key, controller.signal));
    if (!response.ok) {
      if (response.headers.get('X-Guide-Proxy') === 'local') {
        const problem = await response.json().catch(() => null);
        if (problem?.code === 'UPSTREAM_ERROR' && Number.isInteger(problem.upstreamStatus)) {
          const stage = ['exec', 'content', 'exec-redirect'].includes(problem.stage) ? ` (${problem.stage})` : '';
          return { ok: false, code: 'INVALID_RESPONSE', message: `Apps Script returned HTTP ${problem.upstreamStatus}${stage}. The local proxy is reachable.` };
        }
        if (problem?.code === 'INVALID_RESPONSE') return { ok: false, code: 'INVALID_RESPONSE' };
      }
      return { ok: false, code: 'NETWORK_ERROR' };
    }
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('ok' in value) || typeof value.ok !== 'boolean') return { ok: false, code: 'INVALID_RESPONSE' };
    return value as GuideDraftResult;
  } catch (error) {
    return { ok: false, code: controller.signal.aborted ? 'TIMEOUT' : error instanceof SyntaxError ? 'INVALID_RESPONSE' : 'NETWORK_ERROR' };
  } finally { clearTimeout(timeout); }
}
let connectionError = '';
export function guideDraftConnectionError() { return connectionError; }
export function draftConnectionMessage(result: GuideDraftResult): string {
  if (result.ok) return '';
  if (result.code === 'NO_DRAFT') return 'NO SAVED DRAFT'
  if (result.code === 'AUTH_FAILED') return 'Operator Key was not accepted. Check the key and its configured hash.';
  if (result.code === 'TIMEOUT') return 'Draft storage did not respond within 60 seconds. Authentication could not be checked.';
  if (result.code === 'INVALID_RESPONSE') return result.message?.match(/^Apps Script returned HTTP \d{3}( \((exec|content|exec-redirect)\))?\. The local proxy is reachable\.$/) ? result.message : 'Draft storage returned an unexpected response. Check the Web App deployment.';
  return 'Draft storage connection failed. Authentication could not be checked.';
}
export async function performGuideDraftRequest(url: string, action: string, payload: Record<string, unknown>, key: string): Promise<GuideDraftResult> {
  const result = await requestGuideDraft(url, action, payload, key);
  // A lost write response may still have committed: never automatically repeat writes.
  if (['checkAuth', 'getDraft', 'listDraftRevisions', 'getDraftRevision'].includes(action) && !result.ok && result.code === 'NETWORK_ERROR') {
    return requestGuideDraft(url, action, payload, key);
  }
  return result;
}
const json = (action: string, payload: Record<string, unknown>) => performGuideDraftRequest(endpoint, action, payload, operatorKey);
export function requestGuideDraftAction(action: string, payload: Record<string, unknown> = {}) { return json(action, payload) }

function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value }
export async function guideFingerprint(document: GuideDocument): Promise<string> { const canonical = JSON.stringify(stable(document)); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)); return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('') }
export const guideDraftClient: GuideDraftClient = { async connect(key) { if (!key.trim()) { connectionError = 'Enter an Operator Key.'; return false; } operatorKey = key; const result = await json('checkAuth', {}); connectionError = draftConnectionMessage(result); if (!result.ok) { operatorKey = ''; clearStoredOperatorKey(); } else storeOperatorKey(key); return result.ok }, async getDraft(guideId) { return json('getDraft', { guideId }) }, async listDraftRevisions(guideId) { return json('listDraftRevisions', { guideId }) }, async getDraftRevision(guideId, revision) { return json('getDraftRevision', { guideId, revision }) }, async saveDraft(guideId, expectedRevision, basePublishedFingerprint, document) { return json('saveDraft', { guideId, expectedRevision, basePublishedFingerprint, document }) }, async deleteDraft(guideId) { return json('deleteDraft', { guideId }) } }
export function isGuideDraftEnvelope(value: unknown): value is GuideDraftEnvelope { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; const revision = item.revision; return item.format === 'accordbook-guide-draft' && item.formatVersion === 1 && typeof item.guideId === 'string' && typeof revision === 'number' && Number.isInteger(revision) && revision >= 1 && typeof item.updatedAt === 'string' && typeof item.basePublishedFingerprint === 'string' && !!item.document && typeof item.document === 'object' }
export function draftFingerprintChanged(draft: GuideDraftEnvelope | undefined, publishedFingerprint: string) { return Boolean(draft && draft.basePublishedFingerprint !== publishedFingerprint) }
export function retainedRevisionMetadata(revisions: GuideDraftMeta[]) { return [...revisions].sort((a, b) => b.revision - a.revision).slice(0, 5) }
