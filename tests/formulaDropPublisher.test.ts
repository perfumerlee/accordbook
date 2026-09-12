// @ts-nocheck -- Apps Script is exercised with isolated server mocks, never GitHub writes.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const publisher = readFileSync('scripts/apps-script/formula-drop-admin/FormulaDropPublisher.gs', 'utf8');
const admin = readFileSync('scripts/apps-script/formula-drop-admin/FormulaDropAdmin.gs', 'utf8');
const dashboard = readFileSync('scripts/apps-script/formula-drop-admin/Dashboard.html', 'utf8');
const head = 'a'.repeat(40), revision = '2026-09-12T00:00:00.000Z';
const snapshot = { slug: '2026-001', title: 'Public study', subtitle: 'Public intro', description: 'FORMULA COMPOSITION\nMaterial', expiresAt: '2026-09-30T14:59:00.000Z' };
const root = 'public/formula-drops/2026-001/';
const sha = text => createHash('sha1').update(text).digest('hex');
const png = await sharp({ create: { width: 600, height: 315, channels: 3, background: '#eee8dc' } }).png().toBuffer();

function setup(options: any = {}) {
  const calls: any[] = [], blobs: any[] = [];
  let unlocked = false;
  const row = ['DROP-2026-001', 2026, 1, snapshot.title, snapshot.subtitle, snapshot.description, options.status || 'EXPIRED',
    new Date('2026-01-01Z'), new Date(snapshot.expiresAt), 'private-file', 'private-url', 'private-license', 'private-name', 'private-last4', 'private-pin', new Date(revision), new Date(revision)];
  const sheet = { getLastRow: () => 2, getRange: () => ({ getValues: () => [row] }) };
  const context: any = { Date, Buffer,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => options.unconfigured ? null : ({ TOKEN: 'test-server-token', OWNER: 'perfumerlee', REPO: 'accordbook', BRANCH: options.branch || 'main' }[key.replace('FORMULA_DROP_GITHUB_', '')]) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, hasLock: () => true, releaseLock: () => { unlocked = true; } }) },
    Utilities: { base64Decode: value => Array.from(Buffer.from(value, 'base64')), newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8'), getBytes: () => Array.from(Buffer.from(bytes)) }) },
    UrlFetchApp: { fetch(url, config) {
      const path = url.split('/accordbook')[1];
      const body = config.payload ? JSON.parse(config.payload) : undefined;
      calls.push({ path, method: config.method, body, config });
      let code = 200, result: any = {};
      if (options.failure && (options.failureAt ? path.includes(options.failureAt) : true)) { code = options.failure; result = { message: 'secret-server-body' }; }
      else if (path === '/git/ref/heads/main') result = { object: { sha: options.movedHead || head } };
      else if (path.startsWith('/git/commits/') && config.method === 'get') result = { tree: { sha: 'base-tree' } };
      else if (path.includes('/contents/') && path.includes('drop.json')) {
        if (!options.existing) code = 404;
        else result = { type: 'file', size: 500, encoding: 'base64', content: Buffer.from(JSON.stringify(options.existing)).toString('base64') };
      } else if (path.includes('/contents/') && path.includes('og-source.png')) {
        if (!options.image) code = 404; else result = { type: 'file', sha: options.image };
      } else if (path === '/git/blobs') { blobs.push(body); result = { sha: sha(body.content) }; }
      else if (path === '/git/trees') result = { sha: 'new-tree' };
      else if (path === '/git/commits') result = { sha: 'b'.repeat(40) };
      else if (path === '/git/refs/heads/main') result = { object: { sha: 'b'.repeat(40) } };
      else throw new Error('Unexpected test request');
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(result) };
    } },
  };
  runInNewContext(admin + '\n' + publisher + '\nformulaDropSpreadsheet_ = () => testSpreadsheet; checkFormulaDropHeaders_ = () => {};', Object.assign(context, { testSpreadsheet: { getSheetByName: () => sheet } }));
  return { context, calls, blobs, row, unlocked: () => unlocked,
    status: () => context.getFormulaDropPublication('DROP-2026-001'),
    publish: (request = {}, id = 'DROP-2026-001') => context.publishFormulaDropArchive(id, { mode: 'AUTO', head, updatedAt: revision, ...request }) };
}

describe('server-only atomic Formula Drop publisher', () => {
  it('constructs a public allowlist from Sheet; does not leak admin values', () => {
    const x = setup(); const result = x.status();
    expect(result.snapshot).toEqual(snapshot);
    expect(JSON.stringify(result)).not.toMatch(/private-|test-server-token/);
    expect(result.status).toBe('NOT PUBLISHED');
    expect(x.calls.every(call => call.method === 'get')).toBe(true);
  });
  it('missing configuration leaves public preview available without any network writes', () => {
    const x = setup({ unconfigured: true });
    expect(x.status()).toMatchObject({ ok: true, configured: false, mode: 'AUTO', snapshot });
    expect(x.publish()).toMatchObject({ ok: false, error: 'github_not_configured' });
    expect(x.calls).toHaveLength(0);
  });
  it('rejects branches not handled by current main Pages workflow', () => {
    expect(setup({ branch: 'other' }).status().configured).toBe(false);
  });
  it('recognizes semantic equality irrespective of JSON key order', () => {
    const x = setup({ existing: Object.fromEntries(Object.entries(snapshot).reverse()) });
    expect(x.status().status).toBe('SYNCED');
    expect(x.publish().status).toBe('SYNCED');
    expect(x.blobs).toHaveLength(0);
  });
  it('recognizes changed public content and preserves public optional metadata', () => {
    const x = setup({ existing: { ...snapshot, title: 'Old', summary: 'Editorial summary' } });
    expect(x.status().status).toBe('CHANGES NOT PUBLISHED');
    expect(x.publish().ok).toBe(true);
    expect(JSON.parse(x.blobs[0].content)).toEqual({ ...snapshot, summary: 'Editorial summary' });
  });
  it('first AUTO publication creates one JSON source commit with existing base tree', () => {
    const x = setup(); expect(x.publish().status).toBe('PUBLICATION REQUESTED');
    expect(x.calls.find(c => c.path === '/git/trees').body).toEqual({ base_tree: 'base-tree', tree: [{ path: root + 'drop.json', type: 'blob', mode: '100644', sha: sha(x.blobs[0].content) }] });
    expect(x.calls.filter(c => c.path === '/git/commits')).toHaveLength(1);
    expect(x.calls.find(c => c.path === '/git/commits').body.parents).toEqual([head]);
    expect(x.calls.at(-1).body).toEqual({ sha: 'b'.repeat(40), force: false });
    expect(x.unlocked()).toBe(true);
  });
  it('AUTO → CUSTOM creates JSON + image in the same tree/commit', () => {
    const x = setup(); expect(x.publish({ mode: 'CUSTOM', pngBase64: png.toString('base64') }).ok).toBe(true);
    expect(x.calls.find(c => c.path === '/git/trees').body.tree.map(e => e.path)).toEqual([root + 'drop.json', root + 'og-source.png']);
    expect(x.calls.filter(c => c.path === '/git/commits')).toHaveLength(1);
  });
  it('CUSTOM replacement changes only image when public JSON is unchanged', () => {
    const x = setup({ existing: snapshot, image: 'old-image' });
    expect(x.status().mode).toBe('CUSTOM');
    expect(x.publish({ mode: 'CUSTOM', pngBase64: png.toString('base64') }).ok).toBe(true);
    expect(x.calls.find(c => c.path === '/git/trees').body.tree).toHaveLength(1);
    expect(x.calls.find(c => c.path === '/git/trees').body.tree[0].path).toBe(root + 'og-source.png');
  });
  it('CUSTOM → AUTO deletes stale source in same commit as content update', () => {
    const x = setup({ existing: { ...snapshot, title: 'Old' }, image: 'old-image' });
    expect(x.publish().ok).toBe(true);
    const entries = x.calls.find(c => c.path === '/git/trees').body.tree;
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual({ path: root + 'og-source.png', type: 'blob', mode: '100644', sha: null });
    expect(entries.some(e => e.path.endsWith('drop.json') && e.sha === null)).toBe(false);
  });
  it('CUSTOM keep requires an existing source or newly selected image', () => {
    expect(setup().publish({ mode: 'CUSTOM' }).error).toBe('image_required');
    expect(setup({ existing: snapshot, image: 'existing-image' }).publish({ mode: 'CUSTOM' }).status).toBe('SYNCED');
  });
  it.each(['DRAFT', 'SCHEDULED'])('does not leak unpublished %s content', status => {
    const x = setup({ status }); x.row[7] = new Date('2099-01-01Z');
    expect(x.publish().error).toBe('not_publishable');
    expect(x.calls).toHaveLength(0);
  });
  it('expired records retain their permanent archive', () => {
    expect(setup({ status: 'EXPIRED' }).publish().ok).toBe(true);
  });
  it.each(['DROP-2026-001/../../bad', '../2026-001', '2026-001', 'DROP-2026-001?x'])('rejects unsafe path %s', id => {
    const x = setup(); expect(x.publish({}, id).error).toBe('invalid_request'); expect(x.calls).toHaveLength(0);
  });
  it('rejects arbitrary browser-provided snapshot/path/credential fields', () => {
    for (const key of ['snapshot', 'path', 'token', 'accessPin']) {
      const x = setup(); expect(x.publish({ [key]: 'untrusted' }).error).toBe('invalid_request'); expect(x.calls).toHaveLength(0);
    }
  });
  it('rejects private or malformed existing JSON before writing', () => {
    for (const extra of [{ accessPin: 'private-pin' }, { publishedAt: 'not-a-date' }, { nested: {} }]) {
      const x = setup({ existing: { ...snapshot, ...extra } });
      expect(x.publish().error).toBe('repository_content_invalid'); expect(x.blobs).toHaveLength(0);
    }
  });
  it('rejects oversized public text before it creates an unreadable repository record', () => {
    const x = setup(); x.row[5] = 'a'.repeat(100001);
    expect(x.publish().error).toBe('repository_content_invalid'); expect(x.blobs).toHaveLength(0);
  });
  it.each([401, 403, 429, 500])('sanitizes GitHub %s failures without changing Sheet', failure => {
    const x = setup({ failure }), before = JSON.stringify(x.row), result = x.publish();
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toMatch(/secret|token|private/);
    expect(JSON.stringify(x.row)).toBe(before); expect(x.unlocked()).toBe(true);
  });
  it('refuses stale Sheet and repository revisions', () => {
    expect(setup().publish({ updatedAt: 'stale' }).error).toBe('conflict');
    const x = setup({ movedHead: 'c'.repeat(40) }); expect(x.publish().error).toBe('conflict'); expect(x.blobs).toHaveLength(0);
  });
  it('concurrent branch movement rejects final non-force ref update; no second commit/retry', () => {
    const x = setup({ failure: 422, failureAt: '/git/refs/' });
    expect(x.publish().error).toBe('conflict');
    expect(x.calls.filter(c => c.path === '/git/commits')).toHaveLength(1);
    expect(x.calls.at(-1).body.force).toBe(false);
  });
  it('uses server-only token, no redirects, and never returns transport payload', () => {
    const x = setup(); x.status();
    expect(x.calls[0].config.headers.Authorization).toBe('Bearer test-server-token');
    expect(x.calls[0].config.followRedirects).toBe(false);
    expect(publisher).not.toMatch(/console\.|Logger\.|localStorage/);
    expect(dashboard).not.toContain('FORMULA_DROP_GITHUB_TOKEN');
  });
  it('validates PNG signature, corruption, truncation and size before any API request', () => {
    const corrupt = Buffer.from(png); corrupt[35] ^= 1;
    for (const input of ['not-png', Buffer.from('fake').toString('base64'), corrupt.toString('base64'), png.subarray(0, 50).toString('base64'), 'A'.repeat(7 * 1024 * 1024)]) {
      const x = setup(); expect(x.publish({ mode: 'CUSTOM', pngBase64: input }).error).toBe('invalid_png'); expect(x.calls).toHaveLength(0);
    }
  });
  it('rejects undersized decoded PNG', async () => {
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#eee8dc' } }).png().toBuffer();
    expect(setup().publish({ mode: 'CUSTOM', pngBase64: small.toString('base64') }).error).toBe('invalid_png');
  });
});

describe('Admin presentation separation', () => {
  function ui() {
    const nodes: any = {};
    const requests: any[] = [];
    let callback: any;
    const state: any = { data: { ok: true, configured: true, eligible: true, snapshot, mode: 'AUTO', status: 'NOT PUBLISHED', head, updatedAt: revision },
      mode: 'AUTO', dropId: 'DROP-2026-001', host: { isConnected: true, querySelectorAll: () => [] } };
    const context: any = { testState: state, document: { getElementById: id => nodes[id] ||= {} }, confirm: () => true,
      URL: { createObjectURL: () => 'blob:local-test', revokeObjectURL() {} },
      Image: class { naturalWidth = 1200; naturalHeight = 630; decode() { return Promise.resolve(); } },
      google: { script: { run: { withSuccessHandler(fn) { callback = fn; return this; }, withFailureHandler() { return this; },
        publishFormulaDropArchive(id, payload) { requests.push({ id, payload }); } } } } };
    runInNewContext(dashboard.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n    loadDashboard\(\);/, '') + '\npublication = testState;', context);
    return { context, nodes, state, requests, respond: result => callback(result) };
  }
  it('renders escaped AUTO approximate preview without image upload', () => {
    const context: any = { document: {}, google: {} };
    const js = dashboard.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n    loadDashboard\(\);/, '');
    runInNewContext(js, context);
    const html = context.autoOgPreview({ ...snapshot, title: '<script>unsafe</script>' });
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('FORMULA DROP'); expect(html).not.toContain('<img');
    expect(dashboard).toContain('aspect-ratio: 1200 / 630');
    expect(dashboard).toContain('width: 1200px; height: 630px');
    expect(dashboard).toContain('scale(${preview.clientWidth / 1200})');
    expect(dashboard).toContain('width: 900px');
    expect(dashboard).toContain('favicon.svg');
  });
  it('Save remains independent; only explicit confirmed Publish invokes new server action', () => {
    const save = dashboard.slice(dashboard.indexOf('function saveEditor'), dashboard.indexOf('function renderTable'));
    expect(save).toContain('.updateFormulaDrop('); expect(save).not.toMatch(/publishFormulaDropArchive|pngBase64/);
    expect(dashboard).toContain("if (!confirm('저장된 제목");
    expect(dashboard.match(/\.publishFormulaDropArchive\(/g)).toHaveLength(1);
    expect(dashboard).not.toMatch(/localStorage|sessionStorage/);
  });
  it('file selection previews locally without invoking publication; AUTO clears selection', async () => {
    const x = ui(); x.context.changePublicationMode('CUSTOM');
    await x.context.selectPublicationPng({ files: [{ type: 'image/png', size: 1000 }] });
    expect(x.state.objectUrl).toBe('blob:local-test'); expect(x.requests).toHaveLength(0);
    expect(x.nodes['publication-preview'].innerHTML).toContain('<img');
    expect(x.nodes['publication-message'].textContent).toContain('아직 업로드하지 않았습니다');
    x.context.changePublicationMode('AUTO'); expect(x.state.file).toBeNull(); expect(x.state.objectUrl).toBeNull();
  });
  it('rejects oversized client selection with visible error and no write', async () => {
    const x = ui(); x.context.changePublicationMode('CUSTOM');
    await x.context.selectPublicationPng({ files: [{ type: 'image/png', size: 6 * 1024 * 1024 }] });
    expect(x.nodes['publication-message'].textContent).toContain('최대 5 MiB');
    expect(x.nodes['publication-publish'].disabled).toBe(true); expect(x.requests).toHaveLength(0);
  });
  it('requires confirmation, prevents duplicate clicks, and reports requested rather than deployed', async () => {
    const x = ui(); x.context.confirm = () => false; await x.context.publishArchive(); expect(x.requests).toHaveLength(0);
    x.context.confirm = () => true; await x.context.publishArchive(); await x.context.publishArchive();
    expect(x.requests).toHaveLength(1); expect(x.nodes['publication-status'].textContent).toBe('PUBLISHING');
    expect(x.requests[0].payload).toEqual({ mode: 'AUTO', head, updatedAt: revision });
    x.respond({ ok: true, status: 'PUBLICATION REQUESTED', commitUrl: 'https://github.com/perfumerlee/accordbook/commit/' + head });
    expect(x.nodes['publication-status'].textContent).toBe('PUBLICATION REQUESTED');
    expect(x.nodes['publication-message'].innerHTML).toContain('배포 완료를 확인');
  });
  it('publication error remains visible even when a mode change is pending', async () => {
    const x = ui(); x.state.data.mode = 'CUSTOM'; await x.context.publishArchive();
    x.respond({ ok: false, error: 'conflict' });
    expect(x.nodes['publication-status'].textContent).toBe('ERROR');
    expect(x.nodes['publication-message'].textContent).toContain('다시 확인');
  });
});
