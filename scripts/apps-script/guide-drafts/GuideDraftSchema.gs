// Dormant Draft envelope compatibility. Runtime clients may continue writing v1.
function isDraftObject_(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validateDraftEnvelope_(value, guideId) {
  if (!isDraftObject_(value) || value.format !== GUIDE_FORMAT_ || (value.formatVersion !== 1 && value.formatVersion !== 2)) return false;
  if (value.guideId !== guideId || !Number.isInteger(value.revision) || value.revision < 1 || typeof value.updatedAt !== 'string' || typeof value.basePublishedFingerprint !== 'string') return false;
  if (!isDraftObject_(value.document) || !validatePublishDocument_(value.document)) return false;
  if (value.formatVersion === 2) {
    if (!isDraftObject_(value.basePublishedDocument) || !validatePublishDocument_(value.basePublishedDocument)) return false;
  }
  return true;
}
function draftEnvelopeFromSave_(body, guideId, revision) {
  var version = body.formatVersion === 2 || Object.prototype.hasOwnProperty.call(body, 'basePublishedDocument') ? 2 : 1;
  var candidate = { format: GUIDE_FORMAT_, formatVersion: version, guideId: guideId, revision: revision, updatedAt: new Date().toISOString(), basePublishedFingerprint: String(body.basePublishedFingerprint || ''), document: body.document };
  if (version === 2) candidate.basePublishedDocument = body.basePublishedDocument;
  return validateDraftEnvelope_(candidate, guideId) ? candidate : null;
}
function draftSaveFailureReason_(body, guideId) {
  if (body.formatVersion !== undefined && body.formatVersion !== 1 && body.formatVersion !== 2) return 'INVALID_FORMAT_VERSION';
  if (!body.document || typeof body.document !== 'object' || Array.isArray(body.document)) return 'MISSING_DOCUMENT';
  if (body.document.guideId !== guideId) return 'DOCUMENT_GUIDE_ID_MISMATCH';
  if (body.formatVersion === 2 || Object.prototype.hasOwnProperty.call(body, 'basePublishedDocument')) {
    if (!body.basePublishedDocument || typeof body.basePublishedDocument !== 'object' || Array.isArray(body.basePublishedDocument)) return 'MISSING_BASE_PUBLISHED_DOCUMENT';
    if (!validatePublishDocument_(body.basePublishedDocument)) return 'INVALID_BASE_PUBLISHED_DOCUMENT';
  }
  if (!validatePublishDocument_(body.document)) return 'INVALID_DOCUMENT';
  if (typeof body.basePublishedFingerprint !== 'string' || !body.basePublishedFingerprint) return 'INVALID_BASE_PUBLISHED_FINGERPRINT';
  return 'DRAFT_SCHEMA_REJECTED';
}
