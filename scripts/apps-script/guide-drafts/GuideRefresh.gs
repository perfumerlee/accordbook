// Two-step refresh contract. The client computes the approved pure merge; the server owns all identities.
function readPublishedGuide_(guideId) {
  var path = PUBLISH_GUIDE_PATHS_[guideId];
  if (!path) throw { code: 'INVALID_DRAFT' };
  var ref = publishGithub_('get', '/git/refs/heads/' + PUBLISH_BRANCH_);
  var source = publishGithub_('get', '/contents/' + path + '?ref=' + encodeURIComponent(ref.object.sha));
  var document = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(source.content).replace(/\n/g, ''))).getDataAsString());
  if (!validatePublishDocument_(document) || document.guideId !== guideId) throw { code: 'INVALID_PUBLISHED_GUIDE' };
  return { guideId: guideId, document: document, publishedFingerprint: publishFingerprint_(document), commitSha: ref.object.sha };
}
function persistRefreshDraft_(folder, current, document, remote) {
  var next = { format: GUIDE_FORMAT_, formatVersion: 2, guideId: current.guideId, revision: current.revision + 1, updatedAt: new Date().toISOString(), basePublishedFingerprint: remote.publishedFingerprint, basePublishedDocument: remote.document, document: document };
  if (!validateDraftEnvelope_(next, current.guideId)) throw { code: 'INVALID_DRAFT' };
  var text = JSON.stringify(next, null, 2), rev = revisions_(folder);
  rev.createFile('r' + String(next.revision).padStart(6, '0') + '.json', text, MimeType.PLAIN_TEXT);
  var h = folder.getFilesByName('head.json'); if (h.hasNext()) h.next().setContent(text); else folder.createFile('head.json', text, MimeType.PLAIN_TEXT);
  var all = [], it = rev.getFiles(); while (it.hasNext()) { var f = it.next(), m = /^r(\d{6})\.json$/.exec(f.getName()); if (m) all.push({ f: f, n: Number(m[1]) }); }
  all.sort(function(a, b) { return b.n - a.n; }).slice(5).forEach(function(x) { x.f.setTrashed(true); });
  return next;
}
function refreshSetPath_(root, path, value) { var parts = path.split('.'); parts.shift(); var cursor = root; for (var i = 0; i < parts.length - 1; i++) { if (!cursor[parts[i]]) cursor[parts[i]] = {}; cursor = cursor[parts[i]]; } var last = parts[parts.length - 1]; if (value === undefined) delete cursor[last]; else cursor[last] = refreshClone_(value); }
function refreshApplyResolutions_(document, conflicts, resolutions) {
  var result = refreshClone_(document);
  conflicts.forEach(function(c) { var choice = resolutions[c.conflictId]; if (!choice) return; if (choice !== 'published' && choice !== 'mine') throw { code: 'INVALID_REFRESH_RESOLUTION' }; var value = choice === 'published' ? c.remoteValue : c.localValue; if (c.kind === 'order' && c.fieldPath === 'blocks.order') result.blocks = refreshClone_(value).map(function(id) { return result.blocks.filter(function(b) { return b.blockId === id; })[0]; }).filter(Boolean); else if (c.blockId && (c.kind === 'delete-edit' || c.kind === 'edit-delete' || c.kind === 'add-add') && c.fieldPath === 'blocks.' + c.blockId) { result.blocks = result.blocks.filter(function(b) { return b.blockId !== c.blockId; }); if (value) result.blocks.push(refreshClone_(value)); } else refreshSetPath_(result, c.fieldPath, value); });
  return result;
}
function refreshDraftServer_(body) {
  if (!Number.isInteger(body.expectedDraftRevision) || body.expectedDraftRevision < 1 || typeof body.expectedBasePublishedFingerprint !== 'string') return json_({ ok: false, code: 'INVALID_DRAFT' });
  var folder = folder_(body.guideId), lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var current = head_(body.guideId);
    if (!current) return json_({ ok: false, code: 'NO_DRAFT' });
    if (current.formatVersion !== 2 || !current.basePublishedDocument) return json_({ ok: false, code: 'LEGACY_DRAFT_BASE_UNAVAILABLE' });
    if (current.revision !== body.expectedDraftRevision) return json_({ ok: false, code: 'REVISION_CONFLICT', currentRevision: current.revision });
    if (current.basePublishedFingerprint !== body.expectedBasePublishedFingerprint) return json_({ ok: false, code: 'BASE_REVISION_CONFLICT' });
    var remote = readPublishedGuide_(body.guideId);
    if (current.basePublishedFingerprint === remote.publishedFingerprint) return json_({ ok: true, status: 'already-current', draft: current, authoritativePublished: remote });
    if (!body.resolutions && (!body.mergedDocument || body.mergedDocument.guideId !== body.guideId || !validatePublishDocument_(body.mergedDocument))) return json_({ ok: false, code: 'INVALID_REFRESH_PROPOSAL' });
    var verifyRemote = readPublishedGuide_(body.guideId);
    if (verifyRemote.publishedFingerprint !== remote.publishedFingerprint) return json_({ ok: false, code: 'REMOTE_REVISION_CONFLICT' });
    var canonical = mergeGuideDocumentsServer_(current.basePublishedDocument, current.document, verifyRemote.document);
    if (canonical.conflicts.length) {
      if (!body.resolutions) return json_({ ok: true, status: 'conflicts', conflicts: canonical.conflicts, provisionalMergedDocument: canonical.document, authoritativePublished: verifyRemote });
      var chosen = Object.keys(body.resolutions || {});
      if (chosen.length !== canonical.conflicts.length || canonical.conflicts.some(function(c) { return !Object.prototype.hasOwnProperty.call(body.resolutions, c.conflictId); })) return json_({ ok: true, status: 'conflicts', conflicts: canonical.conflicts, provisionalMergedDocument: canonical.document, authoritativePublished: verifyRemote });
      var resolved = refreshApplyResolutions_(canonical.document, canonical.conflicts, body.resolutions);
      if (!validatePublishDocument_(resolved)) return json_({ ok: false, code: 'INVALID_REFRESH_RESOLUTION' });
      var refreshedResolved = persistRefreshDraft_(folder, current, resolved, verifyRemote);
      return json_({ ok: true, status: 'refreshed', draft: refreshedResolved, authoritativePublished: verifyRemote });
    }
    if (!refreshEqual_(body.mergedDocument, canonical.document)) return json_({ ok: false, code: 'INVALID_REFRESH_PROPOSAL' });
    var refreshed = persistRefreshDraft_(folder, current, canonical.document, verifyRemote);
    return json_({ ok: true, status: 'refreshed', draft: refreshed, authoritativePublished: verifyRemote });
  } catch (e) { return json_({ ok: false, code: e.code || 'REFRESH_FAILED' }); }
  finally { lock.releaseLock(); }
}
