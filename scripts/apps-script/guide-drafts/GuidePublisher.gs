// Server-side Guide Publisher. This file belongs to the same Apps Script project.
const PUBLISH_GUIDE_PATHS_ = { 'getting-started': 'content/guide/getting-started.json', 'time-machine': 'content/guide/time-machine.json', 'formula-drop': 'content/guide/formula-drop.json' };
const PUBLISH_OWNER_ = 'perfumerlee', PUBLISH_REPO_ = 'accordbook', PUBLISH_BRANCH_ = 'main';
function publishStable_(v) { if (Array.isArray(v)) return v.map(publishStable_); if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function(k) { o[k] = publishStable_(v[k]); }); return o; } return v; }
function publishFingerprint_(v) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(publishStable_(v)), Utilities.Charset.UTF_8).map(function(b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join(''); }
function publishGithub_(method, path, body) { var token = PropertiesService.getScriptProperties().getProperty('GUIDE_PUBLISH_GITHUB_TOKEN'); if (!token) throw { code: 'GITHUB_AUTH_FAILED' }; var opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }; if (body !== undefined) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); } var r = UrlFetchApp.fetch('https://api.github.com/repos/' + PUBLISH_OWNER_ + '/' + PUBLISH_REPO_ + path, opt), status = r.getResponseCode(), value = {}; try { value = JSON.parse(r.getContentText() || '{}'); } catch (_) {} if (status === 401 || status === 403) throw { code: 'GITHUB_AUTH_FAILED' }; if (status === 404) throw { code: 'GITHUB_SOURCE_NOT_FOUND' }; if (status === 409 || status === 422) throw { code: 'PUBLISH_CONFLICT' }; if (status < 200 || status >= 300) throw { code: 'GITHUB_WRITE_FAILED' }; return value; }
function publishGuideServer_(body) {
  var path = Object.prototype.hasOwnProperty.call(PUBLISH_GUIDE_PATHS_, body.guideId) ? PUBLISH_GUIDE_PATHS_[body.guideId] : null;
  if (!path || !Number.isInteger(body.expectedDraftRevision) || body.expectedDraftRevision < 1) return json_({ ok: false, code: 'INVALID_DRAFT' });
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var current = head_(body.guideId);
    if (!current) return json_({ ok: false, code: 'NO_DRAFT' });
    if (current.revision !== body.expectedDraftRevision) return json_({ ok: false, code: 'REVISION_CONFLICT', currentRevision: current.revision });
    if (!current.document || current.document.guideId !== body.guideId || !Array.isArray(current.document.blocks) || JSON.stringify(current.document).length > 900000) assetFail_('INVALID_DRAFT');
    if (!validatePublishDocument_(current.document)) assetFail_('INVALID_DRAFT');
    publishReferences_(current.document);
    // Pin ALL reads to the exact parent; never fingerprint mutable main then use a newer parent.
    var ref = publishGithub_('get', '/git/refs/heads/' + PUBLISH_BRANCH_), parent = ref.object.sha;
    var commit = publishGithub_('get', '/git/commits/' + parent);
    var source = publishGithub_('get', '/contents/' + path + '?ref=' + parent);
    var published = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(source.content).replace(/\n/g, ''))).getDataAsString());
    if (current.basePublishedFingerprint !== publishFingerprint_(published)) return json_({ ok: false, code: 'PUBLISHED_SOURCE_CHANGED' });
    var treeState = publishGithub_('get', '/git/trees/' + commit.tree.sha + '?recursive=1');
    if (treeState.truncated || !Array.isArray(treeState.tree)) assetFail_('GITHUB_SOURCE_NOT_FOUND');
    var entries = {}; treeState.tree.forEach(function(e) { entries[e.path] = e; });
    if (entries[path] && (entries[path].type !== 'blob' || !/^100(644|755)$/.test(entries[path].mode))) assetFail_('ASSET_PATH_CONFLICT');
    var assets = preflightAssets_(current.document, body.stagedAssets || [], entries);
    var rebased = { format: GUIDE_FORMAT_, formatVersion: 1, guideId: current.guideId, revision: current.revision + 1, updatedAt: new Date().toISOString(), basePublishedFingerprint: publishFingerprint_(current.document), document: current.document };
    var blob = publishGithub_('post', '/git/blobs', { content: JSON.stringify(current.document, null, 2) + '\n', encoding: 'utf-8' });
    var changes = [{ path: path, mode: '100644', type: 'blob', sha: blob.sha }];
    assets.fresh.forEach(function(a) { var created = publishGithub_('post', '/git/blobs', { content: a.base64, encoding: 'base64' }); changes.push({ path: a.path, mode: '100644', type: 'blob', sha: created.sha }); });
    var tree = publishGithub_('post', '/git/trees', { base_tree: commit.tree.sha, tree: changes });
    var made = publishGithub_('post', '/git/commits', { message: 'content: publish guide ' + body.guideId, tree: tree.sha, parents: [parent] });
    if (publishGithub_('get', '/git/refs/heads/' + PUBLISH_BRANCH_).object.sha !== parent) assetFail_('PUBLISH_CONFLICT');
    publishGithub_('patch', '/git/refs/heads/' + PUBLISH_BRANCH_, { sha: made.sha, force: false });
    // Ref success is irreversible publication success. Every following failure is a warning.
    try { savePublishRevision_(folder_(body.guideId), rebased); }
    catch (_) { return json_({ ok: false, code: 'PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED', guideId: body.guideId, commitSha: made.sha, publishedFingerprint: rebased.basePublishedFingerprint, publishedAssets: assets.receipts }); }
    return json_({ ok: true, guideId: body.guideId, commitSha: made.sha, publishedFingerprint: rebased.basePublishedFingerprint, draftRevisionAfterPublish: rebased.revision, publishedAssets: assets.receipts });
  } catch (e) { return json_({ ok: false, code: e.code || 'GITHUB_WRITE_FAILED' }); }
  finally { lock.releaseLock(); }
}
function savePublishRevision_(folder, d) { var text = JSON.stringify(d, null, 2), rev = revisions_(folder); rev.createFile('r' + String(d.revision).padStart(6, '0') + '.json', text, MimeType.PLAIN_TEXT); var h = folder.getFilesByName('head.json'); if (h.hasNext()) h.next().setContent(text); else folder.createFile('head.json', text, MimeType.PLAIN_TEXT); var all = [], it = rev.getFiles(); while (it.hasNext()) { var f = it.next(), m = /^r(\d{6})\.json$/.exec(f.getName()); if (m) all.push({ f: f, n: Number(m[1]) }); } all.sort(function(a, b) { return b.n - a.n; }).slice(5).forEach(function(x) { x.f.setTrashed(true); }); }
