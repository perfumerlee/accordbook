// Phase 8D private transport; no image bytes are stored in Drive.
const PUBLISH_ASSET_MAX_ = 5242880, PUBLISH_AGGREGATE_MAX_ = 5000000, PUBLISH_REQUEST_MAX_ = 6779294;
function publishRequestBytes_(s) { var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 128) n++; else if (c < 2048) n += 2; else if (c >= 55296 && c <= 56319 && s.charCodeAt(i+1) >= 56320 && s.charCodeAt(i+1) <= 57343) { n += 4; i++; } else n += 3; if (n > PUBLISH_REQUEST_MAX_) return n; } return n; }
function assetFail_(code) { throw { code: code }; }
function assetPath_(src, guideId) {
  var m = typeof src === 'string' && /^assets\/([a-z0-9-]+)\/(en|ko)\/(desktop|tablet|mobile)\/([a-z0-9][a-z0-9-]*\.(png|webp))$/.exec(src);
  if (!m) assetFail_('ASSET_PATH_INVALID');
  if (m[1] !== guideId) assetFail_('ASSET_GUIDE_MISMATCH');
  return 'content/guide/assets/' + m.slice(1, 5).join('/');
}
function assetHash_(bytes) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function assetInspect_(raw, extension) {
  function b(i) { return (raw[i] + 256) % 256; }
  function text(i, n) { var s = ''; for (var j = i; j < i + n; j++) s += String.fromCharCode(b(j)); return s; }
  function le(i, n) { var v = 0; for (var j = n - 1; j >= 0; j--) v = v * 256 + b(i + j); return v; }
  var w, h;
  if (extension === 'png') {
    if (raw.length < 33 || [137,80,78,71,13,10,26,10].some(function(v,i) { return b(i) !== v; }) || text(12,4) !== 'IHDR' || le(8,4) !== 218103808) assetFail_('ASSET_DECODE_FAILED');
    w = b(16)*16777216+b(17)*65536+b(18)*256+b(19); h = b(20)*16777216+b(21)*65536+b(22)*256+b(23);
  } else {
    if (raw.length < 25 || text(0,4) !== 'RIFF' || text(8,4) !== 'WEBP' || le(4,4) + 8 !== raw.length) assetFail_('ASSET_DECODE_FAILED');
    var kind = text(12,4), length = le(16,4);
    if (20 + length > raw.length) assetFail_('ASSET_DECODE_FAILED');
    if (kind === 'VP8X' && raw.length >= 30 && length === 10) { w = 1 + le(24,3); h = 1 + le(27,3); }
    else if (kind === 'VP8L' && length >= 5 && b(20) === 47) { var bits = le(21,4); w = 1 + (bits & 16383); h = 1 + ((bits >>> 14) & 16383); }
    else if (kind === 'VP8 ' && raw.length >= 30 && length >= 10 && text(23,3) === '\u009d\u0001\u002a') { w = le(26,2) & 16383; h = le(28,2) & 16383; }
    else assetFail_('ASSET_DECODE_FAILED');
  }
  if (!w || !h) assetFail_('ASSET_DIMENSION_INVALID');
  return { width: w, height: h };
}
function publishReferences_(doc) {
  var refs = [];
  (doc.blocks || []).forEach(function(block) { Object.keys(block.media && block.media.variants || {}).forEach(function(locale) { var variants = block.media.variants[locale]; Object.keys(variants || {}).forEach(function(device) { var v = variants[device]; if (!v || typeof v.src !== 'string') assetFail_('INVALID_DRAFT'); assetPath_(v.src, doc.guideId); if (refs.indexOf(v.src) < 0) refs.push(v.src); }); }); });
  return refs;
}
function preflightAssets_(doc, supplied, entries) {
  if (!Array.isArray(supplied) || supplied.length > 64) assetFail_('ASSET_AGGREGATE_TOO_LARGE');
  var refs = publishReferences_(doc), seen = {}, total = 0, fresh = [], receipts = [];
  refs.forEach(function(src) {
    var parts = assetPath_(src, doc.guideId).split('/');
    for (var i = 1; i < parts.length; i++) { var parent = entries[parts.slice(0,i).join('/')]; if (parent && parent.type !== 'tree') assetFail_('ASSET_PATH_CONFLICT'); }
  });
  supplied.forEach(function(a) {
    var path = assetPath_(a.guidePath, doc.guideId);
    if (refs.indexOf(a.guidePath) < 0) assetFail_('EXTRA_STAGED_ASSET');
    if (seen[a.guidePath]) assetFail_('EXTRA_STAGED_ASSET'); seen[a.guidePath] = true;
    if (typeof a.base64 !== 'string' || a.base64.length > 4*Math.ceil(PUBLISH_ASSET_MAX_/3)) assetFail_('ASSET_TOO_LARGE');
    var padding = a.base64.indexOf('=');
    if (a.base64.length % 4 || /[^A-Za-z0-9+/=]/.test(a.base64) || padding >= 0 && !/^={1,2}$/.test(a.base64.slice(padding))) assetFail_('ASSET_DECODE_FAILED');
    var bytes; try { bytes = Utilities.base64Decode(a.base64); } catch (_) { assetFail_('ASSET_DECODE_FAILED'); }
    if (!bytes.length || bytes.length > PUBLISH_ASSET_MAX_ || bytes.length !== a.size) assetFail_('ASSET_TOO_LARGE');
    total += bytes.length; if (total > PUBLISH_AGGREGATE_MAX_) assetFail_('ASSET_AGGREGATE_TOO_LARGE');
    var ext = a.guidePath.slice(-3) === 'png' ? 'png' : 'webp';
    if (a.mimeType !== 'image/' + ext) assetFail_('ASSET_MIME_MISMATCH');
    var dimensions = assetInspect_(bytes, ext);
    if (dimensions.width !== a.width || dimensions.height !== a.height) assetFail_('ASSET_DIMENSION_INVALID');
    var hash = assetHash_(bytes); if (hash !== a.sha256) assetFail_('ASSET_HASH_MISMATCH');
    var existing = entries[path];
    if (existing) {
      if (existing.type !== 'blob' || !/^100(644|755)$/.test(existing.mode)) assetFail_('ASSET_PATH_CONFLICT');
      var blob = publishGithub_('get', '/git/blobs/' + existing.sha);
      if (blob.encoding !== 'base64' || blob.size !== bytes.length || assetHash_(Utilities.base64Decode(blob.content.replace(/\s/g,''))) !== hash) assetFail_('ASSET_PATH_CONFLICT');
    } else fresh.push({ path: path, base64: a.base64 });
    receipts.push({ guidePath: a.guidePath, sha256: hash });
  });
  refs.forEach(function(src) { var entry = entries[assetPath_(src, doc.guideId)]; if (entry && (entry.type !== 'blob' || !/^100(644|755)$/.test(entry.mode))) assetFail_('ASSET_PATH_CONFLICT'); if (!entry && !seen[src]) assetFail_('STAGED_ASSET_REQUIRED'); });
  return { fresh: fresh, receipts: receipts };
}
