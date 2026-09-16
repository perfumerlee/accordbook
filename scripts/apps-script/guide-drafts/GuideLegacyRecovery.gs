// Read-only GitHub history recovery for upgrading legacy V1 Drafts to V2.
const LEGACY_BASE_HISTORY_LIMIT_ = 50;
function recoverLegacyBaseServer_(guideId, fingerprint) {
  var path = PUBLISH_GUIDE_PATHS_[guideId];
  if (!path || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) throw { code: 'LEGACY_BASE_NOT_FOUND' };
  var commits = publishGithub_('get', '/commits?path=' + encodeURIComponent(path) + '&sha=' + encodeURIComponent(PUBLISH_BRANCH_) + '&per_page=' + LEGACY_BASE_HISTORY_LIMIT_);
  if (!Array.isArray(commits)) throw { code: 'LEGACY_BASE_NOT_FOUND' };
  var match = null, matchDocument = null;
  for (var i = 0; i < Math.min(commits.length, LEGACY_BASE_HISTORY_LIMIT_); i++) {
    var sha = commits[i] && commits[i].sha;
    if (!sha) continue;
    try {
      var source = publishGithub_('get', '/contents/' + path + '?ref=' + encodeURIComponent(sha));
      var document = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(source.content).replace(/\n/g, ''))).getDataAsString());
      if (!validatePublishDocument_(document) || document.guideId !== guideId) continue;
      if (publishFingerprint_(document) !== fingerprint) continue;
      if (matchDocument && !refreshEqual_(matchDocument, document)) throw { code: 'LEGACY_BASE_AMBIGUOUS' };
      match = sha;
      matchDocument = document;
    } catch (e) { if (e && e.code === 'LEGACY_BASE_AMBIGUOUS') throw e; }
  }
  if (!matchDocument) throw { code: commits.length >= LEGACY_BASE_HISTORY_LIMIT_ ? 'LEGACY_BASE_HISTORY_LIMIT' : 'LEGACY_BASE_NOT_FOUND' };
  return { document: matchDocument, commitSha: match };
}
function upgradeLegacyDraftServer_(body) {
  if (!Number.isInteger(body.expectedDraftRevision) || body.expectedDraftRevision < 1) return json_({ ok: false, code: 'INVALID_DRAFT' });
  var folder = folder_(body.guideId), lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var current = head_(body.guideId);
    if (!current) return json_({ ok: false, code: 'NO_DRAFT' });
    if (current.revision !== body.expectedDraftRevision) return json_({ ok: false, code: 'REVISION_CONFLICT', currentRevision: current.revision });
    if (current.formatVersion === 2 && current.basePublishedDocument) return json_({ ok: true, status: 'already-v2', draft: current });
    if (current.formatVersion !== 1 || !current.document || current.basePublishedFingerprint !== body.expectedBasePublishedFingerprint) return json_({ ok: false, code: 'LEGACY_BASE_NOT_FOUND' });
    var recovered = recoverLegacyBaseServer_(body.guideId, current.basePublishedFingerprint);
    var upgraded = { format: GUIDE_FORMAT_, formatVersion: 2, guideId: current.guideId, revision: current.revision + 1, updatedAt: new Date().toISOString(), basePublishedFingerprint: current.basePublishedFingerprint, basePublishedDocument: refreshClone_(recovered.document), document: refreshClone_(current.document) };
    if (!validateDraftEnvelope_(upgraded, body.guideId)) return json_({ ok: false, code: 'INVALID_DRAFT' });
    var text = JSON.stringify(upgraded, null, 2); revisions_(folder).createFile('r' + String(upgraded.revision).padStart(6, '0') + '.json', text, MimeType.PLAIN_TEXT);
    var heads = folder.getFilesByName('head.json'); if (heads.hasNext()) heads.next().setContent(text); else folder.createFile('head.json', text, MimeType.PLAIN_TEXT);
    return json_({ ok: true, status: 'upgraded', draft: upgraded, recoveredBaseFingerprint: current.basePublishedFingerprint, sourceCommitSha: recovered.commitSha });
  } catch (e) { return json_({ ok: false, code: e.code || 'LEGACY_BASE_NOT_FOUND' }); } finally { lock.releaseLock(); }
}
