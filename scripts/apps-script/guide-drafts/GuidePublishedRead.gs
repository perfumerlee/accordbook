// Read-only authoritative Published Guide access for the later Draft rebase flow.
function getPublishedGuideServer_(guideId) {
  var path = PUBLISH_GUIDE_PATHS_[guideId];
  if (!path) return json_({ ok: false, code: 'INVALID_DRAFT' });
  try {
    var ref = publishGithub_('get', '/git/refs/heads/' + PUBLISH_BRANCH_);
    var source = publishGithub_('get', '/contents/' + path + '?ref=' + encodeURIComponent(ref.object.sha));
    var document = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(source.content).replace(/\n/g, ''))).getDataAsString());
    if (!validatePublishDocument_(document) || document.guideId !== guideId) return json_({ ok: false, code: 'INVALID_PUBLISHED_GUIDE' });
    return json_({ ok: true, guideId: guideId, document: document, publishedFingerprint: publishFingerprint_(document), commitSha: ref.object.sha });
  } catch (e) {
    return json_({ ok: false, code: e.code || 'GITHUB_SOURCE_NOT_FOUND' });
  }
}
