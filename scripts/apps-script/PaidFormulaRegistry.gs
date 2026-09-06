// Apps Script V8 runtime. Set SELLER_TOKEN and PIN_PEPPER in Script Properties.
const SPREADSHEET_ID = '1_myhyTYQ_SOHwBp4ljps9KQHMFDH32QgntVzbEZ5_iE';
const SHEET_NAME = 'PaidFormulaLicenses';
const CONFIG_SHEET_NAME = 'PaidFormulaConfig';
const HEADERS = ['packageId', 'buyerName', 'phone', 'phoneLast4', 'pinVerifier', 'productName', 'status', 'issuedAt', 'accessMode', 'requestVerifier'];

function setupPaidFormulaRegistry() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  checkHeaders_(sheet);
  sheet.setFrozenRows(1);
  const config = ss.getSheetByName(CONFIG_SHEET_NAME) || ss.insertSheet(CONFIG_SHEET_NAME);
  if (config.getLastRow() === 0) config.getRange(1, 1, 3, 2).setValues([['key', 'value'], ['SELLER_TOKEN', 'PASTE_SELLER_TOKEN_HERE'], ['PIN_PEPPER', 'PASTE_PIN_PEPPER_HERE']]);
  config.setFrozenRows(1);
}

function checkHeaders_(sheet) {
  if (JSON.stringify(sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]) !== JSON.stringify(HEADERS)) throw new Error('Invalid headers');
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
    const row = [input.packageId, safeCell_(name), input.phone, input.phone.slice(-4), pinVerifier, safeCell_(input.productName), 'active', new Date().toISOString(), 'offline-credentials-v1', requestVerifier];
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
