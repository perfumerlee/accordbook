// Apps Script V8 runtime. Set SELLER_TOKEN and PIN_PEPPER in Script Properties.
const SPREADSHEET_ID = '1_myhyTYQ_SOHwBp4ljps9KQHMFDH32QgntVzbEZ5_iE';
const SHEET_NAME = 'PaidFormulaLicenses';
const CONFIG_SHEET_NAME = 'PaidFormulaConfig';
const HEADERS = ['packageId', 'buyerName', 'phone', 'phoneLast4', 'pinVerifier', 'productName', 'status', 'issuedAt', 'accessMode', 'requestVerifier', 'failedAttempts', 'lockedUntil', 'lastVerifiedAt'];
const HEADER_NOTES = [
  '유료 파일을 식별하는 고유 패키지 ID입니다.',
  '구매자 이름입니다.',
  '구매자가 입력한 전체 전화번호입니다. 판매자 운영용 원본 값입니다.',
  '인증에 사용하는 전화번호 끝 4자리입니다.',
  'PIN 원문이 아닌 서버 검증용 HMAC 값입니다. 직접 수정하거나 삭제하지 마세요.',
  '판매된 Formula 이름입니다.',
  '라이선스 상태입니다. 예: active, revoked.',
  '라이선스가 발급된 시각입니다.',
  '패키지 인증 방식입니다.',
  '중복 등록 요청 검증용 서버 값입니다. 직접 수정하거나 삭제하지 마세요.',
  '현재까지 누적된 인증 실패 횟수입니다. 정상 인증 성공 시 0으로 초기화됩니다.',
  '인증 잠금이 해제되는 시각입니다. 5회 실패 시 30분 잠깁니다.',
  '마지막 정상 인증 시각입니다.'
];

function setupPaidFormulaRegistry() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  checkHeaders_(sheet);
  sheet.getRange(1, 1, 1, HEADERS.length).setNotes([HEADER_NOTES]);
  sheet.setFrozenRows(1);
  const config = ss.getSheetByName(CONFIG_SHEET_NAME) || ss.insertSheet(CONFIG_SHEET_NAME);
  if (config.getLastRow() === 0) config.getRange(1, 1, 3, 2).setValues([['key', 'value'], ['SELLER_TOKEN', 'PASTE_SELLER_TOKEN_HERE'], ['PIN_PEPPER', 'PASTE_PIN_PEPPER_HERE']]);
  config.setFrozenRows(1);
  config.getRange(1, 1, 1, 2).setNotes([['설정 키 이름입니다. SELLER_TOKEN과 PIN_PEPPER를 정확히 입력합니다.', '설정 값입니다. 두 비밀값은 최소 32자 이상이며 구매자에게 공개하지 않습니다.']]);
}

function checkHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn ? sheet.getLastColumn() : HEADERS.length, HEADERS.length)).getValues()[0];
  const legacy = HEADERS.slice(0, 10);
  if (JSON.stringify(current.slice(0, 10)) !== JSON.stringify(legacy)) throw new Error('Invalid headers');
  if (current.slice(10, HEADERS.length).join('|') !== HEADERS.slice(10).join('|')) sheet.getRange(1, 11, 1, 3).setValues([HEADERS.slice(10)]);
}
function configValue_(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return '';
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const row = values.find(item => item[0] === name);
  return row ? String(row[1]).trim() : '';
}
function hmac_(value, secret) {
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8));
}
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function safeCell_(value) { return /^[=+\-@\t\r\n]/.test(value) ? "'" + value : value; }

function doPost(e) {
  let lock;
  try {
    if (!e || !e.postData || e.postData.contents.length > 8000) return reply_({ ok: false });
    const input = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const sellerToken = configValue_('SELLER_TOKEN') || props.getProperty('SELLER_TOKEN');
    const pepper = configValue_('PIN_PEPPER') || props.getProperty('PIN_PEPPER');
    if (input.action === 'verify') return verifyLicense_(input, pepper);
    if (!sellerToken || sellerToken.length < 32 || !pepper || pepper.length < 32 || input.sellerToken !== sellerToken || input.action !== 'register') return reply_({ ok: false });
    if (typeof input.buyerName !== 'string' || typeof input.productName !== 'string' || typeof input.phone !== 'string' || typeof input.pin !== 'string' || typeof input.packageId !== 'string') return reply_({ ok: false });
    const name = input.buyerName.normalize('NFC').trim();
    if (!name || name.length > 100 || input.productName.length > 1000 || !/^010-\d{4}-\d{4}$/.test(input.phone) || !/^\d{6}$/.test(input.pin) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.packageId)) return reply_({ ok: false });
    const pinVerifier = hmac_(JSON.stringify([input.packageId, name, input.phone.slice(-4), input.pin]), pepper);
    const requestVerifier = hmac_(JSON.stringify([input.packageId, name, input.phone, input.pin, input.productName]), pepper);
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Setup required');
    checkHeaders_(sheet);
    const count = sheet.getLastRow() - 1;
    if (count > 0) {
      const ids = sheet.getRange(2, 1, count, 1).getValues();
      const existing = ids.findIndex(row => row[0] === input.packageId);
      if (existing >= 0) {
        const row = sheet.getRange(existing + 2, 1, 1, HEADERS.length).getValues()[0];
        return reply_({ ok: row[9] === requestVerifier && row[6] === 'active', packageId: input.packageId });
      }
    }
    const row = [input.packageId, safeCell_(name), input.phone, input.phone.slice(-4), pinVerifier, safeCell_(input.productName), 'active', new Date().toISOString(), 'offline-credentials-v1', requestVerifier, 0, '', ''];
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length);
    range.setNumberFormat('@');
    range.setValues([row]);
    SpreadsheetApp.flush();
    return reply_({ ok: true, packageId: input.packageId });
  } catch (_) {
    // Never echo or log credentials / request bodies.
    return reply_({ ok: false });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function verifyLicense_(input, pepper) {
  if (!pepper || pepper.length < 32 || typeof input.packageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.packageId)
    || typeof input.buyerName !== 'string' || !input.buyerName.trim() || input.buyerName.length > 100
    || typeof input.phoneLast4 !== 'string' || !/^\d{4}$/.test(input.phoneLast4)
    || typeof input.pin !== 'string' || !/^\d{6}$/.test(input.pin)) return reply_({ ok: false });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) return reply_({ ok: false });
    checkHeaders_(sheet);
    const count = sheet.getLastRow() - 1;
    if (count <= 0) return reply_({ ok: false });
    const row = sheet.getRange(2, 1, count, HEADERS.length).getValues().find(row => row[0] === input.packageId);
    if (!row) return reply_({ ok: false });
    const attempts = Number(row[10] || 0);
    const lockedUntil = row[11] ? new Date(row[11]).getTime() : 0;
    if (lockedUntil > Date.now()) return reply_({ ok: false, locked: true, retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) });
    const expected = hmac_(JSON.stringify([input.packageId, input.buyerName.normalize('NFC').trim(), input.phoneLast4, input.pin]), pepper);
    if (row[6] !== 'active' || row[4] !== expected) {
      const nextAttempts = attempts + 1;
      const nextLocked = nextAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : '';
      const rowIndex = sheet.getRange(2, 1, count, 1).getValues().findIndex(item => item[0] === input.packageId) + 2;
      sheet.getRange(rowIndex, 11, 1, 2).setValues([[nextAttempts, nextLocked]]);
      SpreadsheetApp.flush();
      return nextLocked ? reply_({ ok: false, locked: true, retryAfterSeconds: 1800 }) : reply_({ ok: false });
    }
    const rowIndex = sheet.getRange(2, 1, count, 1).getValues().findIndex(item => item[0] === input.packageId) + 2;
    sheet.getRange(rowIndex, 11, 1, 3).setValues([[0, '', new Date().toISOString()]]);
    SpreadsheetApp.flush();
    return reply_({ ok: true, packageId: input.packageId });
  } finally { lock.releaseLock(); }
}
