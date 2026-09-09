// Apps Script V8 runtime. Public anonymous event endpoint only.
const FORMULA_DROP_SPREADSHEET_ID_PROPERTY = 'FORMULA_DROP_SPREADSHEET_ID';
const FORMULA_DROPS_SHEET_NAME = 'FormulaDrops';
const FORMULA_DROP_EVENTS_SHEET_NAME = 'FormulaDropEvents';
const FORMULA_DROP_HEADERS = ['dropId', 'year', 'sequence', 'title', 'subtitle', 'description', 'status', 'startAt', 'expiresAt', 'fileName', 'fileUrl', 'licenseId', 'publicAccessName', 'publicAccessLast4', 'publicAccessPin', 'createdAt', 'updatedAt'];
const FORMULA_DROP_EVENT_HEADERS = ['eventId', 'timestamp', 'dropId', 'visitorId', 'sessionId', 'eventType', 'source', 'referrerHost', 'failureReason'];
const EVENT_TYPES = ['view', 'download', 'import_attempt', 'import_success', 'import_failed'];
function downloadDrop_(row) {
  const publicDrop = publicDrop_(row); if (!publicDrop || publicDrop.status !== 'ACTIVE') return null;
  const fileName = String(row[9] || '').trim(); const fileUrl = String(row[10] || '').trim(); const accessName = String(row[12] || '').trim(); const accessLast4 = row[13]; const accessPin = row[14];
  if (!fileName || fileName.length > 255 || !/^https:\/\/[^\s]+$/i.test(fileUrl) || fileUrl.length > 2000 || !accessName || !/^\d{4}$/.test(String(accessLast4)) || !/^\d{6}$/.test(String(accessPin))) return null;
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
function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 8000) return json_({ ok: false, error: 'invalid_request' });
    const input = JSON.parse(e.postData.contents);
    if (input.action === 'list-drops') return json_({ ok: true, drops: publicDrops_() });
    if (input.action === 'get-drop') return readDrop_(input);
    if (input.action === 'get-download') return getDownload_(input);
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
function getDownload_(input) {
  if (!input || !/^DROP-\d{4}-\d{3}$/.test(input.dropId || '') || !/^evt_[0-9a-f-]+$/i.test(input.eventId || '') || !/^v_[0-9a-f-]+$/i.test(input.visitorId || '') || !/^s_[0-9a-f-]+$/i.test(input.sessionId || '') || !/^[a-z0-9_-]{1,64}$/.test(input.source || '') || !/^[a-z0-9.-]{0,253}$/i.test(input.referrerHost || '')) return json_({ ok: false, error: 'invalid_request' });
  const ss = spreadsheet_(); const drops = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); const events = ss.getSheetByName(FORMULA_DROP_EVENTS_SHEET_NAME); if (!drops || !events) return json_({ ok: false, error: 'temporarily_unavailable' }); headers_(drops, FORMULA_DROP_HEADERS); headers_(events, FORMULA_DROP_EVENT_HEADERS);
  const row = findDropRow_(drops, input.dropId); const download = row && downloadDrop_(row); if (!download) return json_({ ok: false, error: 'not_available' });
  let lock; try { lock = LockService.getScriptLock(); lock.waitLock(10000); const duplicate = eventExists_(events, input.eventId); if (!duplicate) events.appendRow([input.eventId, new Date(), input.dropId, input.visitorId, input.sessionId, 'download', input.source, input.referrerHost || '', '']); SpreadsheetApp.flush(); return json_({ ok: true, accepted: true, duplicate, download }); } catch (_) { return json_({ ok: false, error: 'temporarily_unavailable' }); } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
