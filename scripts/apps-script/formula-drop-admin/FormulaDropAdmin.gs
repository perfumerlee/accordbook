// Apps Script V8 runtime.
// Phase 1 only: safe schema initialization for a separate Formula Drop workbook.

const FORMULA_DROP_SPREADSHEET_ID_PROPERTY = 'FORMULA_DROP_SPREADSHEET_ID';
const PAID_FORMULA_REGISTRY_ADMIN_URL_PROPERTY = 'PAID_FORMULA_REGISTRY_ADMIN_URL';
const PAID_FORMULA_ADMIN_SECRET_PROPERTY = 'PAID_FORMULA_ADMIN_SECRET';
const FORMULA_DROPS_SHEET_NAME = 'FormulaDrops';
const FORMULA_DROP_EVENTS_SHEET_NAME = 'FormulaDropEvents';
const FORMULA_DROPS_HEADERS = [
  'dropId', 'year', 'sequence', 'title', 'subtitle', 'description', 'status',
  'startAt', 'expiresAt', 'fileName', 'fileUrl', 'licenseId',
  'publicAccessName', 'publicAccessLast4', 'publicAccessPin', 'createdAt', 'updatedAt',
];
const FORMULA_DROP_EVENTS_HEADERS = [
  'eventId', 'timestamp', 'dropId', 'visitorId', 'sessionId', 'eventType',
  'source', 'referrerHost', 'failureReason',
];
const FORMULA_DROP_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED'];
const FORMULA_DROP_EVENT_TYPES = ['view', 'download', 'import_attempt', 'import_success', 'import_failed'];

const FORMULA_DROPS_HEADER_NOTES = [
  '역할:\nFormula Drop의 영구 고유 식별자\n\n형식:\nDROP-YYYY-NNN\n\n예:\nDROP-2026-001\n\n필수:\nYES\n\n기록 주체:\nAdmin / Apps Script\n\n변경 규칙:\n생성 후 변경 금지.\n연도별 sequence는 001부터 증가.\n재사용 금지.\nPaid Formula packageId와 혼동하지 않음.',
  '역할:\nFormula Drop이 속한 연도\n\n형식:\n4자리 연도 숫자\n\n예:\n2026\n\n필수:\nYES\n\n기록 주체:\nApps Script\n\n변경 규칙:\ndropId의 연도 부분에서 파생.\ndropId와 불일치하게 수정하지 않음.',
  '역할:\n해당 연도 내 Formula Drop 순번\n\n형식:\n양의 정수. Sheet에서는 000 형식으로 표시.\n\n예:\n저장값 1 → 표시값 001\n\n필수:\nYES\n\n기록 주체:\nApps Script\n\n변경 규칙:\n연도별 001부터 증가.\n같은 연도에 재사용하지 않음.\ndropId의 sequence 부분과 일치해야 함.',
  '역할:\nFormula Drop 공개 페이지에 표시하는 제목\n\n형식:\n문자열\n\n예:\nCitrus Structure\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\n공개 전 수정 가능.\n공개 후 수정 시 updatedAt 갱신.',
  '역할:\nFormula Drop 제목을 보조하는 짧은 설명\n\n형식:\n문자열 또는 빈 값\n\n예:\nA simple citrus structure for study and adaptation\n\n필수:\nNO\n\n기록 주체:\nAdmin\n\n변경 규칙:\n공개 콘텐츠 변경 시 updatedAt 갱신.',
  '역할:\nFormula Drop의 상세 설명 및 사용 안내\n\n형식:\n일반 텍스트 또는 빈 값\n\n예:\nDownload the licensed formula and open it in Accordbook.\n\n필수:\nNO\n\n기록 주체:\nAdmin\n\n변경 규칙:\nv0.01에서는 실행 가능한 HTML을 저장하지 않음.\n표시 시 안전하게 escape.\n변경 시 updatedAt 갱신.',
  '역할:\nFormula Drop 자체의 운영 상태\n\n형식:\nDRAFT / SCHEDULED / ACTIVE / EXPIRED\n\n예:\nACTIVE\n\n필수:\nYES\n\n기록 주체:\nAdmin / Apps Script\n\n변경 규칙:\nLicensed Formula의 active/revoked 상태와 별개.\n정의된 상태 값만 사용.',
  '역할:\nFormula Drop 공개 운영 시작 시각\n\n형식:\ndatetime\n\n예:\n2026-09-12 10:00:00\n\n필수:\nNO\n단, SCHEDULED 또는 ACTIVE 운영 전에는 필수.\n\n기록 주체:\nAdmin\n\n변경 규칙:\n운영 기준 시간대는 Asia/Seoul.\nDRAFT 단계에서는 빈 값 허용.',
  '역할:\nFormula Drop 공개 배포 종료 시각\n\n형식:\ndatetime\n\n예:\n2026-09-15 23:59:00\n\n필수:\nNO\n단, ACTIVE 운영 전에는 필수.\n\n기록 주체:\nAdmin\n\n변경 규칙:\n운영 기준 시간대는 Asia/Seoul.\n종료 후 역사 페이지는 삭제하지 않음.\n향후 Public API는 이 시각 이후 신규 다운로드를 허용하지 않는 방향으로 사용.',
  '역할:\n사용자에게 다운로드되는 Licensed Formula 파일명\n\n형식:\n.accordbook 파일명\n\n예:\nDROP-2026-001.accordbook\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\n실제 연결된 Licensed Formula 파일과 일치해야 함.\n변경 시 updatedAt 갱신.',
  '역할:\nFormula Drop에서 제공할 Licensed Formula 파일의 저장 위치\n\n형식:\nHTTPS URL\n\n예:\nhttps://example.com/formula.accordbook\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\n운영용 내부 참조값.\n향후 Public API가 이 값을 그대로 반환해야 한다는 의미가 아님.\n파일 접근의 최종 통제는 Licensed Formula verification이 담당.\n변경 시 updatedAt 갱신.',
  '역할:\n이 Formula Drop이 사용하는 기존 Licensed Formula Registry 항목 참조값\n\n형식:\nPaidFormulaLicenses.packageId\n\n예:\nUUID packageId\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\n기존 PaidFormulaLicenses.packageId를 참조.\nbuyerName, phone, phoneLast4, PIN, pinVerifier, status를 복제하지 않음.\nLicensed Formula Registry가 검증 상태의 source of truth.',
  '역할:\nFormula Drop 공개 페이지에서 사용자에게 안내할 공용 Access Name\n\n형식:\n문자열\n\n예:\naccordbook\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\nFormula Drop용으로 의도적으로 공개되는 캠페인 값.\n일반 고객의 buyerName을 복사하지 않음.\n실제 인증 검증의 source of truth가 아님.',
  '역할:\nFormula Drop 공개 페이지에서 사용자에게 안내할 공용 전화번호 끝 4자리 값\n\n형식:\n정확히 4자리 문자열\n\n예:\n0000\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\nPlain Text로 저장.\n선행 0을 제거하면 안 됨.\n일반 고객의 phone 또는 phoneLast4를 복사하지 않음.\nFormula Drop용으로 의도적으로 공개되는 캠페인 값.',
  '역할:\nFormula Drop 공개 페이지에서 사용자에게 안내할 공용 6자리 PIN\n\n형식:\n정확히 6자리 문자열\n\n예:\n012345\n\n필수:\nYES\n\n기록 주체:\nAdmin\n\n변경 규칙:\nPlain Text로 저장.\n선행 0을 제거하면 안 됨.\nFormula Drop용으로 의도적으로 공개되는 캠페인 값.\nPaidFormulaLicenses.pinVerifier를 대체하지 않음.\n실제 인증 검증의 source of truth가 아님.\n\n주의:\n일반 고객에게 발급된 비공개 PIN을 이 열에 기록하지 않음.',
  '역할:\nFormula Drop row가 최초 생성된 시각\n\n형식:\ndatetime\n\n예:\n2026-09-09 10:30:00\n\n필수:\nYES\n\n기록 주체:\nApps Script\n\n변경 규칙:\n생성 후 변경 금지.',
  '역할:\nFormula Drop metadata가 마지막으로 변경된 시각\n\n형식:\ndatetime\n\n예:\n2026-09-09 10:35:00\n\n필수:\nYES\n\n기록 주체:\nApps Script\n\n변경 규칙:\n운영 metadata 변경 시 갱신.\ncreatedAt은 변경하지 않음.',
];

const FORMULA_DROP_EVENTS_HEADER_NOTES = [
  '역할:\nFormula Drop raw event의 고유 식별자\n\n형식:\n랜덤 UUID 기반 문자열\n\n예:\nevt_8f239...\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client / Licensed Import lifecycle\n\n변경 규칙:\n하나의 실제 행동마다 새로운 eventId 생성.\n동일 네트워크 요청 재시도 시에는 같은 eventId를 재사용할 수 있도록 설계.\n수신 후 변경하지 않음.\n\n주의:\n실제 반복 행동과 전송 재시도를 구분하기 위한 식별자이며 개인 식별자가 아님.',
  '역할:\nFormula Drop event가 서버에 수신된 시각\n\n형식:\ndatetime\n\n예:\n2026-09-12 12:30:45\n\n필수:\nYES\n\n기록 주체:\nApps Script\n\n변경 규칙:\nApps Script 서버 수신 시각을 source of truth로 사용.\n클라이언트 시각을 그대로 신뢰하지 않음.',
  '역할:\n이벤트가 연결된 Formula Drop\n\n형식:\nDROP-YYYY-NNN\n\n예:\nDROP-2026-001\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client / Apps Script\n\n변경 규칙:\nFormulaDrops에 존재하는 Drop만 허용하는 방향으로 구현.\nraw event 기록 후 변경하지 않음.',
  '역할:\n동일 브라우저의 반복 행동을 구분하기 위한 익명 식별자\n\n형식:\n랜덤 UUID 기반 문자열\n\n예:\nv_8f239...\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client\n\n변경 규칙:\n향후 localStorage에 저장.\n개인의 실제 신원을 의미하지 않음.\nIP, browser fingerprint, device fingerprint를 사용하지 않음.\n\n주의:\n같은 사용자가 다른 브라우저나 기기를 사용하면 다른 visitorId가 될 수 있음.',
  '역할:\n현재 브라우저 방문 세션의 행동을 구분하기 위한 익명 식별자\n\n형식:\n랜덤 UUID 기반 문자열\n\n예:\ns_29ab1...\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client\n\n변경 규칙:\n향후 sessionStorage에 저장.\n새 브라우저 세션마다 새로 생성.\n개인의 실제 신원을 의미하지 않음.',
  '역할:\nFormula Drop에서 발생한 행동 유형\n\n형식:\nview / download / import_attempt / import_success / import_failed\n\n예:\ndownload\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client / Licensed Import lifecycle\n\n변경 규칙:\n정의된 event type만 허용.\n운영 Dashboard 집계 기준이므로 기존 이름 변경 금지.',
  '역할:\nFormula Drop으로 유입된 마케팅 또는 커뮤니티 출처\n\n형식:\n짧은 문자열 또는 direct\n\n예:\nthreads\n\n필수:\nYES\n\n기록 주체:\nAccordbook Client\n\n변경 규칙:\n향후 URL source parameter 및 Drop attribution context에서 결정.\n값이 없으면 direct.\n개인정보를 넣지 않음.',
  '역할:\n브라우저 referrer의 hostname 부분\n\n형식:\nhostname 또는 빈 값\n\n예:\ncafe.naver.com\n\n필수:\nNO\n\n기록 주체:\nAccordbook Client\n\n변경 규칙:\n전체 URL, path, query string을 저장하지 않음.\nhostname만 저장.',
  '역할:\nimport_failed 이벤트의 분석용 실패 원인\n\n형식:\n정의된 문자열 또는 빈 값\n\n예:\ninvalid_credentials\n\n필수:\nNO\n\n기록 주체:\nLicensed Import lifecycle\n\n변경 규칙:\nimport_failed 외 이벤트에서는 빈 값.\n실제 코드의 실패 경로와 매핑되는 값만 사용.\n사용자 입력값 또는 raw 오류 전문을 저장하지 않음.\n\n주의:\nPhase 1에서는 failure reason enum을 완전히 고정하지 않음.\nPhase 5에서 실제 Licensed Import lifecycle을 기준으로 최종 확정.',
];

function formulaDropSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(FORMULA_DROP_SPREADSHEET_ID_PROPERTY);
  if (!id || !id.trim()) throw new Error('Missing Script Property: FORMULA_DROP_SPREADSHEET_ID');
  const spreadsheet = SpreadsheetApp.openById(id.trim());
  const timezone = spreadsheet.getSpreadsheetTimeZone && spreadsheet.getSpreadsheetTimeZone();
  if (timezone && timezone !== 'Asia/Seoul') Logger.log('WARNING: Spreadsheet timezone is %s; expected Asia/Seoul.', timezone);
  if (typeof Session !== 'undefined' && Session.getScriptTimeZone && Session.getScriptTimeZone() !== 'Asia/Seoul') Logger.log('WARNING: Apps Script timezone is %s; expected Asia/Seoul.', Session.getScriptTimeZone());
  return spreadsheet;
}

function initializeFormulaDropSheets() {
  const spreadsheet = formulaDropSpreadsheet_();
  initializeFormulaDropSheet_(spreadsheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS, FORMULA_DROPS_HEADER_NOTES, 'drops');
  initializeFormulaDropSheet_(spreadsheet, FORMULA_DROP_EVENTS_SHEET_NAME, FORMULA_DROP_EVENTS_HEADERS, FORMULA_DROP_EVENTS_HEADER_NOTES, 'events');
  return { ok: true, sheets: [FORMULA_DROPS_SHEET_NAME, FORMULA_DROP_EVENTS_SHEET_NAME] };
}

function initializeFormulaDropSheet_(spreadsheet, name, headers, notes, kind) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  else checkFormulaDropHeaders_(sheet, name, headers);
  configureFormulaDropSheet_(sheet, headers, notes, kind);
}

function checkFormulaDropHeaders_(sheet, name, headers) {
  const width = Math.max(sheet.getLastColumn(), headers.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(value => String(value));
  if (current.length !== headers.length || current.some((value, index) => value !== headers[index])) {
    throw new Error('Formula Drop sheet header mismatch: ' + name + '. No data was changed.');
  }
}

function configureFormulaDropSheet_(sheet, headers, notes, kind) {
  sheet.getRange(1, 1, 1, headers.length).setNotes([notes]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
  sheet.setFrozenRows(1);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).createFilter();
  const rows = Math.max(sheet.getMaxRows() - 1, 1);
  const index = header => headers.indexOf(header) + 1;
  const textColumns = kind === 'drops' ? ['dropId', 'licenseId', 'publicAccessLast4', 'publicAccessPin'] : ['eventId', 'dropId', 'visitorId', 'sessionId'];
  textColumns.forEach(header => sheet.getRange(2, index(header), rows, 1).setNumberFormat('@'));
  if (kind === 'drops') {
    sheet.getRange(2, index('year'), rows, 1).setNumberFormat('0000');
    sheet.getRange(2, index('sequence'), rows, 1).setNumberFormat('000');
    ['startAt', 'expiresAt', 'createdAt', 'updatedAt'].forEach(header => sheet.getRange(2, index(header), rows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss'));
    sheet.getRange(2, index('status'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(FORMULA_DROP_STATUSES, true).setAllowInvalid(false).build());
    ['title', 'subtitle', 'description'].forEach(header => sheet.getRange(2, index(header), rows, 1).setWrap(true));
    [120, 80, 80, 180, 220, 320, 110, 160, 160, 220, 320, 280, 150, 120, 120, 160, 160].forEach((width, offset) => sheet.setColumnWidth(offset + 1, width));
  } else {
    sheet.getRange(2, index('timestamp'), rows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sheet.getRange(2, index('eventType'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(FORMULA_DROP_EVENT_TYPES, true).setAllowInvalid(false).build());
    [220, 160, 120, 220, 220, 140, 140, 180, 180].forEach((width, offset) => sheet.setColumnWidth(offset + 1, width));
  }
}

function doGet() {
  return HtmlService.createTemplateFromFile('Dashboard').evaluate().setTitle('Accordbook Formula Drop Admin');
}

function getFormulaDropDashboardData() {
  const data = readFormulaDropAdminData_();
  return { drops: data.drops.map(drop => dropSummary_(drop, aggregateDrop_(drop.dropId, data.events).metrics)), active: data.drops.filter(drop => drop.effectiveStatus === 'ACTIVE').sort(dropSort_).map(drop => dropSummary_(drop, aggregateDrop_(drop.dropId, data.events).metrics)), generatedAt: new Date().toISOString() };
}

function getFormulaDropDetail(dropId) {
  if (typeof dropId !== 'string' || !/^DROP-\d{4}-\d{3}$/.test(dropId)) throw new Error('Invalid Drop ID');
  const data = readFormulaDropAdminData_(); const drop = data.drops.find(item => item.dropId === dropId);
  if (!drop) throw new Error('Drop not found');
  const metrics = aggregateDrop_(dropId, data.events); return { drop: dropSummary_(drop, metrics.metrics), metrics: metrics.metrics, sources: metrics.sources, failures: metrics.failures };
}

function getFormulaDropLicenseStatus(dropId) {
  if (typeof dropId !== 'string' || !/^DROP-\d{4}-\d{3}$/.test(dropId)) return { ok: false, error: 'invalid_request' };
  try {
    const ss = formulaDropSpreadsheet_();
    const sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME);
    if (!sheet) return { ok: false, error: 'not_found' };
    checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS);
    const count = sheet.getLastRow() - 1;
    if (count <= 0) return { ok: false, error: 'not_found' };
    const rows = sheet.getRange(2, 1, count, FORMULA_DROPS_HEADERS.length).getValues();
    const matching = rows.filter(row => String(row[0]) === dropId);
    if (matching.length === 0) return { ok: false, error: 'not_found' };
    const licenseId = String(matching[0][11] || '').trim();
    if (!licenseId) return { ok: false, error: 'missing_license_id' };
    const duplicate = rows.some(row => String(row[11] || '').trim() === licenseId && String(row[0]) !== dropId);
    if (duplicate) return { ok: false, error: 'ambiguous_drop_license_mapping' };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(licenseId)) return { ok: false, error: 'invalid_request' };
    return callPaidFormulaRegistryAdminStatus_(licenseId);
  } catch (_) {
    return { ok: false, error: 'registry_unavailable' };
  }
}

// Apps Script editor에서 1회 실행해 UrlFetchApp 외부 요청 권한과
// Registry doPost 접근을 확인합니다. 실제 패키지 ID와 Secret은 보내지 않습니다.
function authorizeExternalRequestOnce() {
  const endpoint = String(PropertiesService.getScriptProperties().getProperty(PAID_FORMULA_REGISTRY_ADMIN_URL_PROPERTY) || '').trim();
  if (!/^https:\/\/[^\s]+$/i.test(endpoint)) {
    return { ok: false, error: 'registry_not_configured' };
  }

  try {
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        action: 'admin-license-status',
        packageId: '00000000-0000-4000-8000-000000000000',
        adminSecret: '',
      }),
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    const body = JSON.parse(response.getContentText() || '{}');
    return { ok: true, statusCode: code, registryError: body.error || null };
  } catch (_) {
    return { ok: false, error: 'registry_unavailable' };
  }
}

function callPaidFormulaRegistryAdminStatus_(packageId) {
  return callPaidFormulaRegistryAdmin_('admin-license-status', packageId);
}

function callPaidFormulaRegistryAdminRevoke_(packageId) {
  return callPaidFormulaRegistryAdmin_('admin-revoke', packageId);
}

function callPaidFormulaRegistryAdmin_(action, packageId) {
  const props = PropertiesService.getScriptProperties();
  const endpoint = String(props.getProperty(PAID_FORMULA_REGISTRY_ADMIN_URL_PROPERTY) || '').trim();
  const secret = String(props.getProperty(PAID_FORMULA_ADMIN_SECRET_PROPERTY) || '').trim();
  if (!endpoint || !/^https:\/\/[^\s]+$/i.test(endpoint) || !secret) return { ok: false, error: 'registry_not_configured' };
  try {
    const response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ action, packageId, adminSecret: secret }), muteHttpExceptions: true });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return { ok: false, error: 'registry_unavailable' };
    const body = JSON.parse(response.getContentText());
    if (!body || body.ok !== true || (body.status !== 'active' && body.status !== 'revoked' && body.status !== 'already_revoked')) {
      const errors = { not_found: 'license_not_found', ambiguous: 'ambiguous_license', unauthorized: 'authorization_failed', invalid_request: 'invalid_request', invalid_license_state: 'invalid_license_state', internal_error: 'registry_unavailable', registry_not_found: 'registry_not_found', registry_ambiguous: 'registry_ambiguous', registry_unauthorized: 'registry_unauthorized' };
      return { ok: false, error: errors[body && body.error] || 'registry_invalid_response' };
    }
    return { ok: true, status: body.status };
  } catch (_) {
    return { ok: false, error: 'registry_unavailable' };
  }
}

function closeAndRevokeFormulaDrop(dropId, expectedUpdatedAt, confirmationDropId) {
  if (!/^DROP-\d{4}-\d{3}$/.test(dropId || '') || confirmationDropId !== dropId) return { ok: false, result: 'rejected', error: 'invalid_request' };
  const closed = expireDropForRevoke_(dropId, expectedUpdatedAt);
  if (!closed.ok) return closed;
  const remote = callPaidFormulaRegistryAdminRevoke_(closed.licenseId);
  if (!remote.ok) return { ok: false, result: 'partial', dropStatus: 'EXPIRED', licenseStatus: 'unknown', error: remote.error, updatedAt: closed.updatedAt };
  return { ok: true, result: 'complete', dropStatus: 'EXPIRED', licenseStatus: remote.status === 'already_revoked' ? 'already_revoked' : 'revoked', updatedAt: closed.updatedAt };
}

function retryFormulaDropLicenseRevoke(dropId, confirmationDropId) {
  if (!/^DROP-\d{4}-\d{3}$/.test(dropId || '') || confirmationDropId !== dropId) return { ok: false, result: 'rejected', error: 'invalid_request' };
  const context = getDropLicenseContext_(dropId);
  if (!context.ok) return context;
  if (context.status !== 'EXPIRED') return { ok: false, result: 'rejected', error: 'invalid_transition' };
  const remote = callPaidFormulaRegistryAdminRevoke_(context.licenseId);
  if (!remote.ok) return { ok: false, result: 'partial', dropStatus: 'EXPIRED', licenseStatus: 'unknown', error: remote.error };
  return { ok: true, result: 'complete', dropStatus: 'EXPIRED', licenseStatus: remote.status === 'already_revoked' ? 'already_revoked' : 'revoked' };
}

function getDropLicenseContext_(dropId) {
  const ss = formulaDropSpreadsheet_(), sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME);
  if (!sheet) return { ok: false, result: 'rejected', error: 'not_found' };
  checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS);
  const count = sheet.getLastRow() - 1;
  if (count <= 0) return { ok: false, result: 'rejected', error: 'not_found' };
  const rows = sheet.getRange(2, 1, count, FORMULA_DROPS_HEADERS.length).getValues();
  const matches = rows.filter(row => String(row[0]) === dropId);
  if (matches.length !== 1) return { ok: false, result: 'rejected', error: matches.length ? 'ambiguous' : 'not_found' };
  const licenseId = String(matches[0][11] || '').trim();
  if (!licenseId) return { ok: false, result: 'rejected', error: 'missing_license_id' };
  if (rows.some(row => String(row[11] || '').trim() === licenseId && String(row[0]) !== dropId)) return { ok: false, result: 'rejected', error: 'ambiguous_drop_license_mapping' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(licenseId)) return { ok: false, result: 'rejected', error: 'invalid_request' };
  return { ok: true, status: String(matches[0][6]), licenseId };
}

function expireDropForRevoke_(dropId, expectedUpdatedAt) {
  return expireFormulaDropInternal_(dropId, expectedUpdatedAt, true);
}

function expireFormulaDropInternal_(dropId, expectedUpdatedAt, requireLicense) {
  let lock;
  try {
    lock = LockService.getScriptLock(); lock.waitLock(10000);
    const ss = formulaDropSpreadsheet_(), sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME);
    if (!sheet) return { ok: false, result: 'rejected', error: 'not_found' };
    checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS);
    const count = sheet.getLastRow() - 1, rows = count > 0 ? sheet.getRange(2, 1, count, FORMULA_DROPS_HEADERS.length).getValues() : [];
    const matches = rows.filter(row => String(row[0]) === dropId);
    if (matches.length !== 1) return { ok: false, result: 'rejected', error: matches.length ? 'ambiguous' : 'not_found' };
    const row = matches[0], licenseId = String(row[11] || '').trim(), duplicate = rows.some(other => String(other[11] || '').trim() === licenseId && String(other[0]) !== dropId);
    if (requireLicense && !licenseId) return { ok: false, result: 'rejected', error: 'missing_license_id' };
    if (requireLicense && duplicate) return { ok: false, result: 'rejected', error: 'ambiguous_drop_license_mapping' };
    if (String(row[6]) !== 'ACTIVE') return { ok: false, result: 'rejected', error: 'invalid_transition' };
    const actualUpdated = row[16] instanceof Date ? row[16].toISOString() : '';
    if (expectedUpdatedAt && actualUpdated !== expectedUpdatedAt) return { ok: false, result: 'rejected', error: 'conflict' };
    const now = new Date(), rowNumber = matches.indexOf(row) + 2;
    sheet.getRange(rowNumber, 7).setValue('EXPIRED'); sheet.getRange(rowNumber, 17).setValue(now); SpreadsheetApp.flush();
    const confirmed = sheet.getRange(rowNumber, 7, 1, 17).getValues()[0];
    // The read starts at column G (status), so Q (updatedAt) is index 10.
    const confirmedDate = confirmed[10] instanceof Date ? confirmed[10] : new Date(confirmed[10]);
    const confirmedUpdatedAt = !isNaN(confirmedDate.getTime()) ? confirmedDate.toISOString() : '';
    // Sheets commonly persists Date values at second precision, so do not
    // require millisecond-identical ISO strings for a successful read-back.
    if (String(confirmed[0]) !== 'EXPIRED' || !confirmedUpdatedAt) return { ok: false, result: 'rejected', error: 'drop_expiry_not_persisted' };
    return { ok: true, licenseId, updatedAt: confirmedUpdatedAt };
  } catch (_) { return { ok: false, result: 'rejected', error: 'internal_error' }; } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function readFormulaDropAdminData_() {
  const ss = formulaDropSpreadsheet_(); const dropsSheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); const eventsSheet = ss.getSheetByName(FORMULA_DROP_EVENTS_SHEET_NAME);
  if (!dropsSheet || !eventsSheet) throw new Error('Formula Drop sheets unavailable');
  checkFormulaDropHeaders_(dropsSheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS); checkFormulaDropHeaders_(eventsSheet, FORMULA_DROP_EVENTS_SHEET_NAME, FORMULA_DROP_EVENTS_HEADERS);
  const dropCount = dropsSheet.getLastRow() - 1, eventCount = eventsSheet.getLastRow() - 1;
  const drops = dropCount > 0 ? dropsSheet.getRange(2, 1, dropCount, FORMULA_DROPS_HEADERS.length).getValues().map(adminDrop_) : [];
  const ids = new Set(drops.map(drop => drop.dropId));
  const events = eventCount > 0 ? eventsSheet.getRange(2, 1, eventCount, FORMULA_DROP_EVENTS_HEADERS.length).getValues().map(adminEvent_).filter(event => ids.has(event.dropId)) : [];
  return { drops: drops.filter(Boolean).sort(dropSort_), events };
}
function adminDrop_(row) {
  const start = row[7] instanceof Date && !isNaN(row[7].getTime()) ? row[7] : null, end = row[8] instanceof Date && !isNaN(row[8].getTime()) ? row[8] : null, raw = String(row[6] || '');
  let effective = raw, now = new Date();
  if (raw === 'ACTIVE') effective = !start || !end ? 'INVALID' : now < start ? 'SCHEDULED' : now >= end ? 'EXPIRED' : 'ACTIVE';
  if (raw === 'SCHEDULED' && (!start || now >= start)) effective = start ? (end && now < end ? 'ACTIVE' : 'EXPIRED') : 'INVALID';
  return { dropId: String(row[0]), year: Number(row[1]), sequence: Number(row[2]), title: String(row[3] || ''), subtitle: String(row[4] || ''), status: raw, effectiveStatus: effective, startAt: start ? start.toISOString() : null, expiresAt: end ? end.toISOString() : null, createdAt: row[15] instanceof Date ? row[15].toISOString() : null, updatedAt: row[16] instanceof Date ? row[16].toISOString() : null };
}
function adminEvent_(row) { return { dropId: String(row[2] || ''), visitorId: String(row[3] || ''), eventType: String(row[5] || ''), source: String(row[6] || '').trim() || 'unknown', failureReason: String(row[8] || '').trim() || 'unknown' }; }
function dropSort_(a, b) { return b.year - a.year || b.sequence - a.sequence; }
function dropSummary_(drop, metrics) { return { ...drop, metrics: metrics || {} }; }
function aggregateDrop_(dropId, events) {
  const rows = events.filter(event => event.dropId === dropId && ['view', 'download', 'import_attempt', 'import_success', 'import_failed'].indexOf(event.eventType) >= 0);
  const sets = { view: new Set(), download: new Set(), import_success: new Set() }; rows.forEach(e => { if (sets[e.eventType] && e.visitorId) sets[e.eventType].add(e.visitorId); });
  const metrics = { totalViews: rows.filter(e => e.eventType === 'view').length, uniqueVisitors: sets.view.size, totalDownloads: rows.filter(e => e.eventType === 'download').length, uniqueDownloaders: sets.download.size, repeatDownloads: Math.max(rows.filter(e => e.eventType === 'download').length - sets.download.size, 0), importAttempts: rows.filter(e => e.eventType === 'import_attempt').length, importFailures: rows.filter(e => e.eventType === 'import_failed').length, totalImportSuccesses: rows.filter(e => e.eventType === 'import_success').length, uniqueImporters: sets.import_success.size };
  metrics.visitToDownload = metrics.uniqueVisitors ? metrics.uniqueDownloaders / metrics.uniqueVisitors * 100 : null; metrics.downloadToImport = metrics.uniqueDownloaders ? metrics.uniqueImporters / metrics.uniqueDownloaders * 100 : null; metrics.visitToImport = metrics.uniqueVisitors ? metrics.uniqueImporters / metrics.uniqueVisitors * 100 : null;
  const groups = {}; rows.forEach(e => { if (!groups[e.source]) groups[e.source] = { visitors: new Set(), downloaders: new Set(), importers: new Set() }; if (e.eventType === 'view' && e.visitorId) groups[e.source].visitors.add(e.visitorId); if (e.eventType === 'download' && e.visitorId) groups[e.source].downloaders.add(e.visitorId); if (e.eventType === 'import_success' && e.visitorId) groups[e.source].importers.add(e.visitorId); });
  const sources = Object.keys(groups).map(source => ({ source, uniqueVisitors: groups[source].visitors.size, uniqueDownloaders: groups[source].downloaders.size, uniqueImporters: groups[source].importers.size })).sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || a.source.localeCompare(b.source)); const failures = {}; rows.filter(e => e.eventType === 'import_failed').forEach(e => failures[e.failureReason] = (failures[e.failureReason] || 0) + 1);
  return { metrics, sources, failures: Object.keys(failures).map(reason => ({ reason, count: failures[reason] })) };
}

function createFormulaDropDraft(payload) {
  let lock; try { lock = LockService.getScriptLock(); lock.waitLock(10000); const ss = formulaDropSpreadsheet_(); const sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) throw new Error('unavailable'); checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS); const now = new Date(), year = now.getFullYear(), count = sheet.getLastRow() - 1; const rows = count > 0 ? sheet.getRange(2, 1, count, FORMULA_DROPS_HEADERS.length).getValues() : []; const sequence = rows.reduce((max, row) => Number(row[1]) === year ? Math.max(max, Number(row[2]) || 0) : max, 0) + 1; if (sequence > 999) throw new Error('validation_failed'); const dropId = 'DROP-' + year + '-' + String(sequence).padStart(3, '0'); const values = normalizeDropPatch_(payload || {}); validateDropPatch_(values, 'DRAFT', rows, undefined); sheet.getRange(sheet.getLastRow() + 1, 1, 1, FORMULA_DROPS_HEADERS.length).setValues([[dropId, year, sequence, values.title, values.subtitle, values.description, 'DRAFT', values.startAt, values.expiresAt, values.fileName, values.fileUrl, values.licenseId, values.publicAccessName, values.publicAccessLast4, values.publicAccessPin, now, now]]); SpreadsheetApp.flush(); return { ok: true, dropId, status: 'DRAFT', updatedAt: now.toISOString() }; } catch (e) { return mutationError_(e); } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
function getFormulaDropAdminConfig(dropId) { if (!/^DROP-\d{4}-\d{3}$/.test(dropId || '')) throw new Error('invalid_request'); const ss = formulaDropSpreadsheet_(), sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) throw new Error('not_found'); checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS); const found = findAdminDropRow_(sheet, dropId); if (!found) throw new Error('not_found'); const row = found.row; return { dropId, status: String(row[6]), updatedAt: row[16] instanceof Date ? row[16].toISOString() : '', title: String(row[3] || ''), subtitle: String(row[4] || ''), description: String(row[5] || ''), startAt: toAdminDate_(row[7]), expiresAt: toAdminDate_(row[8]), fileName: String(row[9] || ''), fileUrl: String(row[10] || ''), licenseId: String(row[11] || ''), publicAccessName: String(row[12] || ''), publicAccessLast4: String(row[13] || ''), publicAccessPin: String(row[14] || '') }; }
function updateFormulaDrop(dropId, expectedUpdatedAt, patch) { if (patch && ['dropId', 'year', 'sequence', 'status', 'createdAt', 'updatedAt'].some(key => Object.prototype.hasOwnProperty.call(patch, key))) return { ok: false, error: 'invalid_request' }; return mutateDrop(dropId, expectedUpdatedAt, patch, 'edit'); }
function scheduleFormulaDrop(dropId, expectedUpdatedAt) { return mutateDrop(dropId, expectedUpdatedAt, {}, 'schedule'); }
function activateFormulaDrop(dropId, expectedUpdatedAt) { return mutateDrop(dropId, expectedUpdatedAt, {}, 'activate'); }
function returnFormulaDropToDraft(dropId, expectedUpdatedAt) { return mutateDrop(dropId, expectedUpdatedAt, {}, 'draft'); }
function expireFormulaDrop(dropId, expectedUpdatedAt) {
  const result = expireFormulaDropInternal_(dropId, expectedUpdatedAt, false);
  return result.ok ? { ok: true, dropId, status: 'EXPIRED', updatedAt: result.updatedAt } : { ok: false, error: result.error };
}
function findAdminDropRow_(sheet, dropId) { const count = sheet.getLastRow() - 1; if (count <= 0) return null; const rows = sheet.getRange(2, 1, count, FORMULA_DROPS_HEADERS.length).getValues(); const index = rows.findIndex(row => String(row[0]) === dropId); return index < 0 ? null : { row: rows[index], rowNumber: index + 2 }; }
function toAdminDate_(value) { return value instanceof Date && !isNaN(value.getTime()) ? Utilities.formatDate(value, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm") : ''; }
function normalizeDropPatch_(input) { const value = input || {}; return { title: String(value.title || '').trim(), subtitle: String(value.subtitle || '').trim(), description: String(value.description || '').trim(), startAt: value.startAt ? new Date(value.startAt) : '', expiresAt: value.expiresAt ? new Date(value.expiresAt) : '', fileName: String(value.fileName || '').trim(), fileUrl: String(value.fileUrl || '').trim(), licenseId: String(value.licenseId || '').trim(), publicAccessName: String(value.publicAccessName || '').trim(), publicAccessLast4: String(value.publicAccessLast4 || ''), publicAccessPin: String(value.publicAccessPin || '') }; }
function validateDropPatch_(value, status, rows, currentId) { if (value.title.length > 200) throw new Error('validation_failed'); if (value.publicAccessLast4 && !/^\d{4}$/.test(value.publicAccessLast4)) throw new Error('validation_failed'); if (value.publicAccessPin && !/^\d{6}$/.test(value.publicAccessPin)) throw new Error('validation_failed'); if (value.licenseId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.licenseId)) throw new Error('validation_failed'); if (value.fileUrl && !/^https:\/\/[^\s]+$/i.test(value.fileUrl)) throw new Error('validation_failed'); if (value.fileName && !/\.accordbook$/i.test(value.fileName)) throw new Error('validation_failed'); if (value.startAt && isNaN(value.startAt.getTime()) || value.expiresAt && isNaN(value.expiresAt.getTime())) throw new Error('validation_failed'); if (value.startAt && value.expiresAt && value.expiresAt <= value.startAt) throw new Error('validation_failed'); if (['SCHEDULED', 'ACTIVE'].indexOf(status) >= 0 && (!value.startAt || !value.expiresAt)) throw new Error('validation_failed'); if (status === 'ACTIVE' && (!value.title || !value.fileName || !value.fileUrl || !value.licenseId || !value.publicAccessName || !/^\d{4}$/.test(value.publicAccessLast4) || !/^\d{6}$/.test(value.publicAccessPin) || value.expiresAt <= new Date())) throw new Error('validation_failed'); if (value.licenseId && rows.some(row => String(row[11] || '') === value.licenseId && row[0] !== currentId)) throw new Error('duplicate_license_id'); }
 function mutateDrop(dropId, expectedUpdatedAt, patch, action) { let lock; try { lock = LockService.getScriptLock(); lock.waitLock(10000); const ss = formulaDropSpreadsheet_(), sheet = ss.getSheetByName(FORMULA_DROPS_SHEET_NAME); if (!sheet) throw new Error('not_found'); checkFormulaDropHeaders_(sheet, FORMULA_DROPS_SHEET_NAME, FORMULA_DROPS_HEADERS); const found = findAdminDropRow_(sheet, dropId); if (!found) throw new Error('not_found'); const row = found.row, raw = String(row[6]), actualUpdated = row[16] instanceof Date ? row[16].toISOString() : ''; if (expectedUpdatedAt && actualUpdated !== expectedUpdatedAt) throw new Error('conflict'); const next = normalizeDropPatch_(Object.assign({ title: row[3], subtitle: row[4], description: row[5], startAt: row[7], expiresAt: row[8], fileName: row[9], fileUrl: row[10], licenseId: row[11], publicAccessName: row[12], publicAccessLast4: row[13], publicAccessPin: row[14] }, patch || {})); let status = raw; if (action === 'schedule') { if (raw !== 'DRAFT' || !next.startAt || next.startAt <= new Date()) throw new Error('invalid_transition'); status = 'SCHEDULED'; } else if (action === 'activate') { if (['DRAFT', 'SCHEDULED'].indexOf(raw) < 0) throw new Error('invalid_transition'); status = 'ACTIVE'; } else if (action === 'draft') { if (raw !== 'SCHEDULED') throw new Error('invalid_transition'); status = 'DRAFT'; } else if (action === 'expire') { if (raw !== 'ACTIVE') throw new Error('invalid_transition'); status = 'EXPIRED'; } else if (action === 'edit') { const sensitive = ['fileUrl', 'licenseId', 'publicAccessName', 'publicAccessLast4', 'publicAccessPin', 'fileName']; if (raw === 'EXPIRED' || (raw === 'SCHEDULED' && sensitive.some(key => patch && patch[key] !== undefined)) || (raw === 'ACTIVE' && (patch.startAt !== undefined || sensitive.some(key => patch && patch[key] !== undefined)))) throw new Error('invalid_transition'); } validateDropPatch_(next, status, sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), FORMULA_DROPS_HEADERS.length).getValues(), dropId); const now = new Date(); const cells = [[next.title, next.subtitle, next.description, status, next.startAt, next.expiresAt, next.fileName, next.fileUrl, next.licenseId, next.publicAccessName, next.publicAccessLast4, next.publicAccessPin, row[15], now]]; sheet.getRange(found.rowNumber, 4, 1, 14).setValues([cells[0]]); SpreadsheetApp.flush(); return { ok: true, dropId, status, updatedAt: now.toISOString() }; } catch (e) { return mutationError_(e); } finally { if (lock && lock.hasLock()) lock.releaseLock(); } }
function mutationError_(error) { const message = error && error.message; const allowed = ['invalid_request', 'not_found', 'validation_failed', 'conflict', 'invalid_transition', 'duplicate_license_id']; return { ok: false, error: allowed.indexOf(message) >= 0 ? message : 'internal_error' }; }
