import type { GuideDocument } from '../models/guide'

export type GuideDraftEnvelope = { format: 'accordbook-guide-draft'; formatVersion: 1; guideId: string; revision: number; updatedAt: string; basePublishedFingerprint: string; document: GuideDocument }
export type GuideDraftMeta = Pick<GuideDraftEnvelope, 'revision' | 'updatedAt' | 'basePublishedFingerprint'>
export type GuideDraftResult = { ok: true; draft?: GuideDraftEnvelope; revisions?: GuideDraftMeta[]; revision?: number; updatedAt?: string } | { ok: false; code: 'AUTH_FAILED' | 'NO_DRAFT' | 'REVISION_CONFLICT' | 'INVALID_DRAFT' | 'REVISION_NOT_FOUND' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE'; message?: string; currentRevision?: number }
export type GuideDraftClient = { connect(key: string): Promise<boolean>; getDraft(guideId: string): Promise<GuideDraftResult>; listDraftRevisions(guideId: string): Promise<GuideDraftResult>; getDraftRevision(guideId: string, revision: number): Promise<GuideDraftResult>; saveDraft(guideId: string, expectedRevision: number | null, basePublishedFingerprint: string, document: GuideDocument): Promise<GuideDraftResult>; deleteDraft(guideId: string): Promise<GuideDraftResult> }
const endpoint = (import.meta.env.VITE_GUIDE_DRAFT_ENDPOINT ?? '').trim()
let operatorKey = ''
export function createGuideDraftRequest(action: string, payload: Record<string, unknown>, key: string, signal?: AbortSignal): RequestInit { return { method: 'POST', body: JSON.stringify({ action, ...payload, operatorKey: key }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, credentials: 'omit', redirect: 'follow', signal } }
export async function requestGuideDraft(url: string, action: string, payload: Record<string, unknown>, key: string): Promise<GuideDraftResult> {
  if (!url || !key) return { ok: false, code: 'NETWORK_ERROR' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, createGuideDraftRequest(action, payload, key, controller.signal));
    if (!response.ok) return { ok: false, code: 'NETWORK_ERROR' };
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
  if (result.code === 'AUTH_FAILED') return 'Operator Key was not accepted. Check the key and its configured hash.';
  if (result.code === 'TIMEOUT') return 'Draft storage did not respond within 60 seconds. Authentication could not be checked.';
  if (result.code === 'INVALID_RESPONSE') return 'Draft storage returned an unexpected response. Check the Web App deployment.';
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

function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value }
export async function guideFingerprint(document: GuideDocument): Promise<string> { const canonical = JSON.stringify(stable(document)); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)); return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('') }
export const guideDraftClient: GuideDraftClient = { async connect(key) { if (!key.trim()) { connectionError = 'Enter an Operator Key.'; return false; } operatorKey = key; const result = await json('checkAuth', {}); connectionError = draftConnectionMessage(result); if (!result.ok) operatorKey = ''; return result.ok }, async getDraft(guideId) { return json('getDraft', { guideId }) }, async listDraftRevisions(guideId) { return json('listDraftRevisions', { guideId }) }, async getDraftRevision(guideId, revision) { return json('getDraftRevision', { guideId, revision }) }, async saveDraft(guideId, expectedRevision, basePublishedFingerprint, document) { return json('saveDraft', { guideId, expectedRevision, basePublishedFingerprint, document }) }, async deleteDraft(guideId) { return json('deleteDraft', { guideId }) } }
export function isGuideDraftEnvelope(value: unknown): value is GuideDraftEnvelope { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; const revision = item.revision; return item.format === 'accordbook-guide-draft' && item.formatVersion === 1 && typeof item.guideId === 'string' && typeof revision === 'number' && Number.isInteger(revision) && revision >= 1 && typeof item.updatedAt === 'string' && typeof item.basePublishedFingerprint === 'string' && !!item.document && typeof item.document === 'object' }
export function draftFingerprintChanged(draft: GuideDraftEnvelope | undefined, publishedFingerprint: string) { return Boolean(draft && draft.basePublishedFingerprint !== publishedFingerprint) }
export function retainedRevisionMetadata(revisions: GuideDraftMeta[]) { return [...revisions].sort((a, b) => b.revision - a.revision).slice(0, 5) }
