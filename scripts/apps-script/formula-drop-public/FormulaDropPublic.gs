// Apps Script V8 runtime. Public anonymous event endpoint only.
const FORMULA_DROP_SPREADSHEET_ID_PROPERTY = 'FORMULA_DROP_SPREADSHEET_ID';
const FORMULA_DROPS_SHEET_NAME = 'FormulaDrops';
const FORMULA_DROP_EVENTS_SHEET_NAME = 'FormulaDropEvents';
const FORMULA_DROP_HEADERS = ['dropId', 'year', 'sequence', 'title', 'subtitle', 'description', 'status', 'startAt', 'expiresAt', 'fileName', 'fileUrl', 'licenseId', 'publicAccessName', 'publicAccessLast4', 'publicAccessPin', 'createdAt', 'updatedAt'];
const FORMULA_DROP_EVENT_HEADERS = ['eventId', 'timestamp', 'dropId', 'visitorId', 'sessionId', 'eventType', 'source', 'referrerHost', 'failureReason'];
const EVENT_TYPES = ['view', 'download', 'import_attempt', 'import_success', 'import_failed', 'drop_open_in_accordbook_click', 'drop_handoff_load_success', 'drop_handoff_load_failure', 'drop_handoff_import_success'];
const FORMULA_DROP_ALLOWED_PACKAGE_HOSTS = ['accordbook.org'];
const FORMULA_DROP_HANDOFF_TTL_MS = 10 * 60 * 1000;
const FORMULA_DROP_HANDOFF_PREFIX = 'FORMULA_DROP_HANDOFF_';
function allowedPackageUrl_(value) { return typeof value === 'string' && /^https:\/\/accordbook\.org\/formula-drops\/\d{4}-\d{3}\/[A-Za-z0-9_-]+\.accordbook$/.test(value); }
function buildFormulaDropFileName_(dropId, existingFileName, title) { if (!/^DROP-\d{4}-\d{3}$/.test(dropId || '')) return ''; const source = String(existingFileName || '').trim().replace(/\.accordbook$/i, '').replace(/^ACBK-DROP-(?:\d{4}-)?\d{3}[-_]?/i, '').replace(/^DROP-(?:\d{4}-)?\d{3}[-_]?/i, '') || String(title || '').trim(); const stem = source.normalize('NFC').replace(/[\\/:*?"<>|]+/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'formula-drop'; return 'ACBK-DROP-' + dropId.slice(5) + '-' + stem + '.accordbook'; }
function downloadDrop_(row) {
  const publicDrop = publicDrop_(row); if (!publicDrop || publicDrop.status !== 'ACTIVE') return null;
  const fileName = buildFormulaDropFileName_(String(row[0] || '').trim(), String(row[9] || '').trim(), String(row[3] || '').trim()); const fileUrl = String(row[10] || '').trim(); const accessName = String(row[12] || '').trim(); const accessLast4 = row[13]; const accessPin = row[14];
  if (!fileName || fileName.length > 255 || !allowedPackageUrl_(fileUrl) || fileUrl.length > 2000) return null;
  if (!String(row[11] || '').trim()) return { fileName, fileUrl };
  if (!accessName || !/^\d{4}$/.test(String(accessLast4)) || !/^\d{6}$/.test(String(accessPin))) return null;
  return { fileName, fileUrl, accessName, accessLast4: String(accessLast4), accessPin: String(accessPin) };
}
function findDropRow_(sheet, dropId) { const count = sheet.getLastRow() - 1; if (count <= 0) return null; const rows = sheet.getRange(2, 1, count, FORMULA_DROP_HEADERS.length).getValues(); return rows.find(row => row[0] === dropId) || null; }
function publicDrop_(row) {
  const [dropId, year, sequence, title, subtitle, description, status, startAt, expiresAt] = row;
  const start = startAt instanceof Date && !isNaN(startAt.getTime()) ? startAt : null;
  const expires = expiresAt instanceof Date && !isNaN(expiresAt.getTime()) ? expiresAt : null;
  const now = new Date(); let effective = status;
  if (status === 'ACTIVE') { if (!start || !expires) return null; if (now >= expires) effective = 'EXPIRED'; else if (now < start) return null; }
  if (effective !== 'ACTIVE' && effective !== 'EXPIRED') return null;
  return { dropId: String(dropId), slug: String(dropId).replace(/^DROP-/, ''), year: Number(year), sequence: Number(sequence), title: String(title || ''), subtitle: String(subtitle || ''), description: String(description || ''), status: effective, startAt: start ? start.toISOString() : null, expiresAt: expires ? expires.toISOString() : null };
}
function publicDrops_() {
  const ss = spreadsheet_(); const sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) throw new Error('Unavailable'); headers_(sheet, FORMULA_DROP_HEADERS);
  const count = sheet.getLastRow() - 1; const rows = count > 0 ? sheet.getRange(2, 1, count, FORMULA_DROP_HEADERS.length).getValues() : [];
  return rows.map(publicDrop_).filter(Boolean).sort((a, b) => b.year - a.year || b.sequence - a.sequence);
}
function readDrop_(input) { if (!input || typeof input.dropId !== 'string' || !/^DROP-\d{4}-\d{3}$/.test(input.dropId)) return json_({ ok: false, error: 'invalid_request' }); const found = publicDrops_().find(drop => drop.dropId === input.dropId); return found ? json_({ ok: true, drop: found }) : json_({ ok: false, error: 'not_found' }); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function spreadsheet_() { const id = PropertiesService.getScriptProperties().getProperty(FORMULA_DROP_SPREADSHEET_ID_PROPERTY); if (!id || !id.trim()) throw new Error('Missing configuration'); return SpreadsheetApp.openById(id.trim()); }
function headers_(sheet, expected) { const actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expected.length)).getValues()[0].map(String); if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error('Schema mismatch'); }
function safe_(value, pattern, max, allowBlank) { return typeof value === 'string' && value.length <= max && (allowBlank && value === '' || pattern.test(value)); }
function validRequest_(input) {
  return input && input.action === 'event' && safe_(input.eventId, /^evt_[0-9a-f-]+$/i, 45, false) && safe_(input.dropId, /^DROP-\d{4}-\d{3}$/, 14, false) && safe_(input.visitorId, /^v_[0-9a-f-]+$/i, 45, false) && safe_(input.sessionId, /^s_[0-9a-f-]+$/i, 45, false) && EVENT_TYPES.indexOf(input.eventType) >= 0 && safe_(input.source, /^[a-z0-9_-]{1,64}$/, 64, false) && safe_(input.referrerHost || '', /^[a-z0-9.-]{1,253}$/i, 253, true) && safe_(input.failureReason || '', /^[a-zA-Z0-9_-]{0,128}$/, 128, true);
}
function dropExists_(sheet, dropId) { const count = sheet.getLastRow() - 1; if (count <= 0) return false; return sheet.getRange(2, 1, count, 1).getValues().some(row => row[0] === dropId); }
function eventExists_(sheet, eventId) { const count = sheet.getLastRow() - 1; if (count <= 0) return false; return sheet.getRange(2, 1, count, 1).getValues().some(row => row[0] === eventId); }
function createDropHandoff_(input) {
  if (!input || !/^DROP-[0-9]{4}-[0-9]{3}$/.test(input.dropId || '')) return json_({ ok: false, error: 'invalid_request' });
  const sheet = spreadsheet_().getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) return json_({ ok: false, error: 'not_found' }); headers_(sheet, FORMULA_DROP_HEADERS);
  const row = findDropRow_(sheet, input.dropId); const drop = row && publicDrop_(row); if (!drop || drop.status !== 'ACTIVE') return json_({ ok: false, error: 'not_found' });
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(FORMULA_DROP_HANDOFF_PREFIX + token, JSON.stringify({ dropId: input.dropId, expiresAt: Date.now() + FORMULA_DROP_HANDOFF_TTL_MS }));
  return json_({ ok: true, handoff: { token, expiresAt: Date.now() + FORMULA_DROP_HANDOFF_TTL_MS } });
}
function resolveDropHandoff_(input) {
  if (!input || typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token)) return json_({ ok: false, error: 'invalid_handoff' });
  const key = FORMULA_DROP_HANDOFF_PREFIX + input.token; const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return json_({ ok: false, error: 'invalid_handoff' });
  let record; try { record = JSON.parse(raw); } catch (_) { PropertiesService.getScriptProperties().deleteProperty(key); return json_({ ok: false, error: 'invalid_handoff' }); }
  if (!record || typeof record.dropId !== 'string' || !/^DROP-[0-9]{4}-[0-9]{3}$/.test(record.dropId) || typeof record.expiresAt !== 'number' || Date.now() >= record.expiresAt) {
    PropertiesService.getScriptProperties().deleteProperty(key); return json_({ ok: false, error: 'expired_handoff' });
  }
  const sheet = spreadsheet_().getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) return json_({ ok: false, error: 'not_found' }); headers_(sheet, FORMULA_DROP_HEADERS);
  const row = findDropRow_(sheet, record.dropId); const drop = row && publicDrop_(row); if (!drop || drop.status !== 'ACTIVE') return json_({ ok: false, error: 'not_found' });
  return json_({ ok: true, dropId: record.dropId, expiresAt: record.expiresAt });
}
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 8000) return json_({ ok: false, error: 'invalid_request' });
    const input = JSON.parse(e.postData.contents);
    if (input.action === 'list-drops') return json_({ ok: true, drops: publicDrops_() });
    if (input.action === 'get-drop') return readDrop_(input);
    if (input.action === 'get-download') return getDownload_(input);
    if (input.action === 'resolve-import-drop') return resolveImportDrop_(input);
    if (input.action === 'create-drop-handoff') return createDropHandoff_(input);
    if (input.action === 'resolve-drop-handoff') return resolveDropHandoff_(input);
    if (input.action === 'resolve-drop-package') return resolveDropPackage_(input);
    if (!validRequest_(input)) return json_({ ok: false, error: 'invalid_request' });
    const ss = spreadsheet_(); const drops = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); const events = ss.getSheetByName(FORMULA_DROP_EVENTS_SHEET_NAME);
    if (!drops || !events) return json_({ ok: false, error: 'unavailable' }); headers_(drops, FORMULA_DROP_HEADERS); headers_(events, FORMULA_DROP_EVENT_HEADERS);
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    if (!dropExists_(drops, input.dropId)) return json_({ ok: false, error: 'invalid_request' });
    if (eventExists_(events, input.eventId)) return json_({ ok: true, accepted: true, duplicate: true });
    events.appendRow([input.eventId, new Date(), input.dropId, input.visitorId, input.sessionId, input.eventType, input.source, input.referrerHost || '', input.failureReason || '']);
    SpreadsheetApp.flush(); return json_({ ok: true, accepted: true, duplicate: false });
  } catch (_) { return json_({ ok: false, error: 'unavailable' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function resolveImportDrop_(input) {
  if (!input || typeof input.packageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.packageId)) return json_({ ok: false, error: 'not_found' });
  const sheet = spreadsheet_().getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) return json_({ ok: false, error: 'not_found' }); headers_(sheet, FORMULA_DROP_HEADERS);
  const count = sheet.getLastRow() - 1; if (count <= 0) return json_({ ok: false, error: 'not_found' });
  const matches = sheet.getRange(2, 1, count, FORMULA_DROP_HEADERS.length).getValues().filter(row => String(row[11] || '').trim() === input.packageId);
  if (matches.length > 1) return json_({ ok: false, error: 'ambiguous_mapping' });
  return matches.length === 1 ? json_({ ok: true, dropId: String(matches[0][0]) }) : json_({ ok: false, error: 'not_found' });
}
function getDownload_(input) {
  if (!input || !/^DROP-\d{4}-\d{3}$/.test(input.dropId || '') || !/^evt_[0-9a-f-]+$/i.test(input.eventId || '') || !/^v_[0-9a-f-]+$/i.test(input.visitorId || '') || !/^s_[0-9a-f-]+$/i.test(input.sessionId || '') || !/^[a-z0-9_-]{1,64}$/.test(input.source || '') || !/^[a-z0-9.-]{0,253}$/i.test(input.referrerHost || '')) return json_({ ok: false, error: 'invalid_request' });
  const ss = spreadsheet_(); const drops = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); const events = ss.getSheetByName(FORMULA_DROP_EVENTS_SHEET_NAME); if (!drops || !events) return json_({ ok: false, error: 'temporarily_unavailable' }); headers_(drops, FORMULA_DROP_HEADERS); headers_(events, FORMULA_DROP_EVENT_HEADERS);
  const row = findDropRow_(drops, input.dropId); const download = row && downloadDrop_(row); if (!download) return json_({ ok: false, error: 'not_available' });
  let lock; try { lock = LockService.getScriptLock(); lock.waitLock(10000); const duplicate = eventExists_(events, input.eventId); if (!duplicate) events.appendRow([input.eventId, new Date(), input.dropId, input.visitorId, input.sessionId, 'download', input.source, input.referrerHost || '', '']); SpreadsheetApp.flush(); return json_({ ok: true, accepted: true, duplicate, download }); } catch (_) { return json_({ ok: false, error: 'temporarily_unavailable' }); } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function resolveDropPackage_(input) {
  if (!input || !/^DROP-\d{4}-\d{3}$/.test(input.dropId || '')) return json_({ ok: false, error: 'invalid_request' });
  const sheet = spreadsheet_().getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) return json_({ ok: false, error: 'not_found' }); headers_(sheet, FORMULA_DROP_HEADERS);
  const row = findDropRow_(sheet, input.dropId); const drop = row && publicDrop_(row); if (!drop || drop.status !== 'ACTIVE') return json_({ ok: false, error: 'not_found' });
  const fileName = buildFormulaDropFileName_(String(row[0] || '').trim(), String(row[9] || '').trim(), String(row[3] || '').trim()); const fileUrl = String(row[10] || '').trim();
  if (!allowedPackageUrl_(fileUrl) || fileUrl.length > 2000 || fileUrl.split('/')[4] !== input.dropId.slice(5)) return json_({ ok: false, error: 'package_unavailable' });
  let response;
  try { response = UrlFetchApp.fetch(fileUrl, { followRedirects: false, muteHttpExceptions: true }); }
  catch (error) {
    // Keep raw exceptions (which may contain URLs) out of public responses.
    const message = String(error && error.message || '');
    const authorization = /script.external_request|permission|authorization|권한|승인/i.test(message);
    return json_({ ok: false, error: authorization ? 'package_fetch_authorization_required' : 'package_fetch_failed' });
  }
  const text = response.getContentText();
  if (response.getResponseCode() !== 200 || response.getContent().length > 16000000) return json_({ ok: false, error: 'invalid_drop_package' });
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.type !== 'accordbook-formula' || parsed.formatVersion !== 2) return json_({ ok: false, error: 'package_type_mismatch' });
    if (!parsed.formula || parsed.formula.name !== String(row[3] || '') || typeof parsed.formula.notes !== 'string' || !Array.isArray(parsed.formula.rows) || !parsed.provenance || typeof parsed.provenance !== 'object' || Array.isArray(parsed.provenance)) throw new Error('invalid_formula');
    parsed.formula.rows.forEach(function (r) {
      if (!r || typeof r.material !== 'string' || !(r.parts === '' || typeof r.parts === 'number' && isFinite(r.parts))) throw new Error('invalid_row');
      if (r.cas !== undefined && typeof r.cas !== 'string' || r.marked !== undefined && typeof r.marked !== 'boolean') throw new Error('invalid_row');
      if (r.dilution !== undefined && (!r.dilution || typeof r.dilution.enabled !== 'boolean' || typeof r.dilution.percent !== 'number' || !isFinite(r.dilution.percent) || typeof r.dilution.solvent !== 'string')) throw new Error('invalid_dilution');
    });
  } catch (_) { return json_({ ok: false, error: 'invalid_drop_package' }); }
  return json_({ ok: true, package: { dropId: input.dropId, fileName, packageText: text, packageType: 'accordbook-formula', title: String(row[3] || '') } });
}

// Run once from the Apps Script editor as the deployment owner after adding
// UrlFetchApp. This triggers authorization without changing Sheets or events.
function checkFormulaDropResolver() {
  const output = resolveDropPackage_({ dropId: 'DROP-2026-001' });
  const result = JSON.parse(output.getContent());
  const summary = { ok: result.ok, error: result.error || null };
  if (result.ok && result.package) {
    const parsed = JSON.parse(result.package.packageText);
    summary.packageType = parsed.type;
    summary.formatVersion = parsed.formatVersion;
    summary.materialCount = parsed.formula.rows.length;
    summary.totalParts = parsed.formula.rows.reduce(function (sum, row) { return sum + (typeof row.parts === 'number' ? row.parts : 0); }, 0);
  }
  console.log(JSON.stringify(summary));
  return summary;
}

// Run this directly from the Apps Script editor to request the UrlFetch scope.
// The call is intentionally outside the resolver catch so Apps Script can show
// its OAuth consent dialog instead of returning a masked resolver error.
function authorizeFormulaDropFetch() {
  const response = UrlFetchApp.fetch('https://accordbook.org/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook', {
    followRedirects: false,
    muteHttpExceptions: true,
  });
  const result = {
    status: response.getResponseCode(),
    bytes: response.getContent().length,
  };
  console.log(JSON.stringify(result));
  return result;
}
