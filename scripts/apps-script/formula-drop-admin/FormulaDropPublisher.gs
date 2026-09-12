// Private Admin project only. Deploy with FormulaDropAdmin.gs and Dashboard.html.
// GitHub credentials never leave ScriptProperties. No Sheet writes in this file.
const DROP_PUBLISH_MAX_PNG_BYTES = 5 * 1024 * 1024;

function dropPublishConfig_() {
  const p = PropertiesService.getScriptProperties();
  const config = {};
  ['TOKEN', 'OWNER', 'REPO', 'BRANCH'].forEach(key => {
    config[key.toLowerCase()] = String(p.getProperty('FORMULA_DROP_GITHUB_' + key) || '').trim();
  });
  // The existing Pages workflow is deliberately main-only.
  if (!config.token || !/^[\w-]+$/.test(config.owner) || !/^[\w.-]+$/.test(config.repo) || config.branch !== 'main') {
    throw new Error('github_not_configured');
  }
  return config;
}

function dropPublishRecord_(dropId) {
  if (!/^DROP-\d{4}-\d{3}$/.test(dropId || '')) throw new Error('invalid_request');
  const sheet = formulaDropSpreadsheet_().getSheetByName(FORMULA_DROPS_SHEET_NAME);
  if (!sheet) throw new Error('not_found');
  checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS);
  const found = findAdminDropRow_(sheet, dropId);
  if (!found) throw new Error('not_found');
  const row = found.row;
  // Explicit allowlist, NOT an admin DTO spread. No file URL, license or access fields.
  const snapshot = {
    slug: dropId.slice(5), title: String(row[3] || '').trim(),
    subtitle: String(row[4] || ''), description: String(row[5] || ''),
  };
  if (row[8] instanceof Date && isFinite(row[8].getTime())) snapshot.expiresAt = row[8].toISOString();
  const effective = adminDrop_(row).effectiveStatus;
  return { snapshot: dropPublicJson_(snapshot), updatedAt: row[16] instanceof Date ? row[16].toISOString() : '',
    eligible: ['ACTIVE', 'EXPIRED'].indexOf(effective) >= 0 && !!snapshot.title && !!snapshot.description.trim() };
}

function dropPublishError_(error) {
  const allowed = ['github_not_configured', 'invalid_request', 'not_found', 'not_publishable',
    'conflict', 'github_auth', 'github_error', 'repository_content_invalid', 'invalid_png', 'image_required'];
  return { ok: false, error: allowed.indexOf(error.message) >= 0 ? error.message : 'github_error' };
}

function dropGithub_(config, method, path, body, allowMissing) {
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.github.com/repos/' + config.owner + '/' + config.repo + path, {
      method, headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' }, contentType: 'application/json',
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }), muteHttpExceptions: true,
      followRedirects: false,
    });
  } catch (_) { throw new Error('github_error'); }
  const code = response.getResponseCode();
  if (code === 404 && allowMissing) return null;
  if (code === 401 || code === 403) throw new Error('github_auth');
  if (code === 409 || code === 422) throw new Error('conflict');
  if (code < 200 || code >= 300) throw new Error('github_error');
  try { return JSON.parse(response.getContentText()); } catch (_) { throw new Error('github_error'); }
}

function dropPublicJson_(value) {
  const keys = ['slug', 'title', 'subtitle', 'summary', 'description', 'publishedAt', 'updatedAt', 'expiresAt'];
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(key => keys.indexOf(key) < 0 || typeof value[key] !== 'string')) {
    throw new Error('repository_content_invalid');
  }
  if (!/^\d{4}-\d{3}$/.test(value.slug || '') || !value.title || !value.description ||
      ['publishedAt', 'updatedAt', 'expiresAt'].some(key => value[key] !== undefined && !/^\d{4}-\d\d-\d\dT/.test(value[key]) || value[key] !== undefined && !isFinite(Date.parse(value[key])))) {
    throw new Error('repository_content_invalid');
  }
  if (Utilities.newBlob(JSON.stringify(value)).getBytes().length > 100000) throw new Error('repository_content_invalid');
  const normalized = {};
  Object.keys(value).forEach(key => {
    normalized[key] = String(value[key]).replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n').trim();
  });
  normalized.description = normalized.description.split('\n').filter((line, index, lines) =>
    !(index > 0 && /^\s*\d+\s+materials?\s*$/i.test(line) && /^\s*FORMULA COMPOSITION\s*$/i.test(lines[index - 1]))
  ).join('\n').trim();
  return normalized;
}

function dropSemanticJson_(value) {
  const ordered = {};
  Object.keys(value).sort().forEach(key => { ordered[key] = value[key]; });
  return JSON.stringify(ordered);
}

function dropRepositoryState_(config, slug) {
  const head = dropGithub_(config, 'get', '/git/ref/heads/' + config.branch).object.sha;
  const commit = dropGithub_(config, 'get', '/git/commits/' + head);
  const root = 'public/formula-drops/' + slug + '/';
  const json = dropGithub_(config, 'get', '/contents/' + root + 'drop.json?ref=' + head, undefined, true);
  const image = dropGithub_(config, 'get', '/contents/' + root + 'og-source.png?ref=' + head, undefined, true);
  let snapshot = null;
  if (json) {
    if (json.type !== 'file' || json.encoding !== 'base64' || json.size > 100000) throw new Error('repository_content_invalid');
    try { snapshot = dropPublicJson_(JSON.parse(Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString('UTF-8'))); }
    catch (_) { throw new Error('repository_content_invalid'); }
    if (snapshot.slug !== slug) throw new Error('repository_content_invalid');
  }
  if (image && image.type !== 'file') throw new Error('repository_content_invalid');
  return { head, tree: commit.tree.sha, root, snapshot, image: image && image.sha };
}

function buildCanonicalPublicArchiveSnapshot_(record, repository) {
  // Preserve existing public-only optional editorial metadata without inventing dates.
  const snapshot = Object.assign({}, repository.snapshot || {}, record.snapshot);
  if (!record.snapshot.expiresAt) delete snapshot.expiresAt;
  return dropPublicJson_(snapshot);
}

function getFormulaDropPublication(dropId) {
  try {
    const record = dropPublishRecord_(dropId);
    let config;
    try { config = dropPublishConfig_(); }
    catch (_) { return { ok: true, configured: false, ...record, status: 'NOT CONFIGURED', mode: 'AUTO' }; }
    const repo = dropRepositoryState_(config, record.snapshot.slug);
    return { ok: true, configured: true, ...record, head: repo.head, mode: repo.image ? 'CUSTOM' : 'AUTO',
      status: !repo.snapshot ? 'NOT PUBLISHED' : dropSemanticJson_(repo.snapshot) === dropSemanticJson_(buildCanonicalPublicArchiveSnapshot_(record, repo)) ? 'SYNCED' : 'CHANGES NOT PUBLISHED',
      imageUrl: repo.image ? 'https://raw.githubusercontent.com/' + config.owner + '/' + config.repo + '/' + repo.head + '/' + repo.root + 'og-source.png' : null };
  } catch (error) { return dropPublishError_(error); }
}

function dropValidatePng_(base64) {
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(DROP_PUBLISH_MAX_PNG_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('invalid_png');
  let bytes;
  try { bytes = Utilities.base64Decode(base64).map(b => (b + 256) % 256); }
  catch (_) { throw new Error('invalid_png'); }
  const fail = () => { throw new Error('invalid_png'); };
  if (bytes.length > DROP_PUBLISH_MAX_PNG_BYTES || bytes.slice(0, 8).join(',') !== '137,80,78,71,13,10,26,10') fail();
  const uint = i => bytes[i] * 16777216 + bytes[i + 1] * 65536 + bytes[i + 2] * 256 + bytes[i + 3];
  let offset = 8, idat = false, end = false;
  while (offset + 12 <= bytes.length) {
    const length = uint(offset), type = String.fromCharCode.apply(null, bytes.slice(offset + 4, offset + 8));
    if (offset + length + 12 > bytes.length || type === 'acTL') fail();
    if (offset === 8) {
      const width = uint(offset + 8), height = uint(offset + 12);
      if (type !== 'IHDR' || length !== 13 || width < 600 || height < 315 || width * height > 40000000) fail();
    } else if (type === 'IHDR') fail();
    // Verify chunk integrity; final decoding/normalization still belongs to the build.
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== uint(offset + 8 + length)) fail();
    if (type === 'IDAT') idat = true;
    offset += length + 12;
    if (type === 'IEND') { if (length !== 0 || offset !== bytes.length) fail(); end = true; break; }
  }
  if (!idat || !end) fail();
  return base64;
}

function publishFormulaDropArchive(dropId, request) {
  let lock;
  try {
    if (!request || Object.keys(request).some(key => ['mode', 'pngBase64', 'head', 'updatedAt'].indexOf(key) < 0) ||
        ['AUTO', 'CUSTOM'].indexOf(request.mode) < 0 || !/^[a-f0-9]{40}$/.test(request.head || '') || typeof request.updatedAt !== 'string' ||
        (request.mode === 'AUTO' && request.pngBase64)) throw new Error('invalid_request');
    const png = request.pngBase64 ? dropValidatePng_(request.pngBase64) : null;
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    const record = dropPublishRecord_(dropId);
    if (!record.eligible) throw new Error('not_publishable');
    if (record.updatedAt !== request.updatedAt) throw new Error('conflict');
    const config = dropPublishConfig_(), repo = dropRepositoryState_(config, record.snapshot.slug);
    if (repo.head !== request.head) throw new Error('conflict');
    if (request.mode === 'CUSTOM' && !png && !repo.image) throw new Error('image_required');
    const snapshot = buildCanonicalPublicArchiveSnapshot_(record, repo), entries = [];
    const blob = (content, encoding) => dropGithub_(config, 'post', '/git/blobs', { content, encoding }).sha;
    if (!repo.snapshot || dropSemanticJson_(snapshot) !== dropSemanticJson_(repo.snapshot)) {
      entries.push({ path: repo.root + 'drop.json', mode: '100644', type: 'blob', sha: blob(JSON.stringify(snapshot, null, 2) + '\n', 'utf-8') });
    }
    if (request.mode === 'CUSTOM' && png) {
      const sha = blob(png, 'base64');
      if (sha !== repo.image) entries.push({ path: repo.root + 'og-source.png', mode: '100644', type: 'blob', sha });
    } else if (request.mode === 'AUTO' && repo.image) {
      entries.push({ path: repo.root + 'og-source.png', mode: '100644', type: 'blob', sha: null });
    }
    if (!entries.length) return { ok: true, status: 'SYNCED', commit: repo.head };
    const tree = dropGithub_(config, 'post', '/git/trees', { base_tree: repo.tree, tree: entries });
    const commit = dropGithub_(config, 'post', '/git/commits', { message: 'Publish Formula Drop ' + snapshot.slug,
      tree: tree.sha, parents: [repo.head] });
    // Non-fast-forward updates fail. No forced update, automatic overwrite, or partial file commits.
    dropGithub_(config, 'patch', '/git/refs/heads/' + config.branch, { sha: commit.sha, force: false });
    return { ok: true, status: 'PUBLICATION REQUESTED', commit: commit.sha,
      commitUrl: 'https://github.com/' + config.owner + '/' + config.repo + '/commit/' + commit.sha };
  } catch (error) { return dropPublishError_(error); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
