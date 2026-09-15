// Apps Script equivalent of the GuideDocument publication checks in guideContracts.ts.
function validatePublishDocument_(d) {
  function id(v) { return typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v); }
  function text(v) { return typeof v === 'string' && v.trim().length > 0; }
  function media(m) {
    if (!m || !id(m.figureId) || !m.variants || !m.variants.en) return false;
    return Object.keys(m.variants).every(function(l) {
      return ['en','ko'].indexOf(l) >= 0 && Object.keys(m.variants[l] || {}).every(function(device) {
        var v = m.variants[l][device];
        if (!v || ['desktop','tablet','mobile'].indexOf(device) < 0) return false;
        assetPath_(v.src, d.guideId);
        return text(v.alt) && text(v.caption) && text(v.viewport);
      });
    });
  }
  if (!d || d.schemaVersion !== 1 || !id(d.guideId) || !id(d.slug) || !d.locales || !d.locales.en || !Array.isArray(d.blocks)) return false;
  if (!['en','ko'].every(function(l) {
    var c = d.locales[l]; if (!c) return l === 'ko';
    if (['NOT_TRANSLATED','DRAFT','NEEDS_REVIEW','PUBLISHED'].indexOf(c.status) < 0 || l === 'en' && c.status === 'NOT_TRANSLATED') return false;
    return c.status !== 'PUBLISHED' || text(c.title) && text(c.subtitle) && c.seo && text(c.seo.title) && text(c.seo.description);
  })) return false;
  var ids = {};
  return d.blocks.every(function(b) {
    if (!b || !id(b.blockId) || ids[b.blockId]) return false; ids[b.blockId] = true;
    if (['heading','paragraph','step','screenshot','note','warning','divider','link'].indexOf(b.type) < 0) return false;
    if (b.type === 'heading' && [2,3].indexOf(b.level) < 0) return false;
    if (b.type === 'step' && (!Number.isInteger(b.step) || b.step < 1)) return false;
    if (['heading','paragraph','step','note','warning','link'].indexOf(b.type) >= 0) {
      if (!b.content || !Object.keys(b.content).every(function(l) { return ['en','ko'].indexOf(l) >= 0 && b.content[l] && text(b.content[l].text); })) return false;
      if (d.locales.ko && d.locales.ko.status === 'PUBLISHED' && (!b.content.ko || !text(b.content.ko.text))) return false;
    }
    if (b.type === 'screenshot' || b.type === 'step' && b.media) if (!media(b.media)) return false;
    if (b.type === 'link' && !(typeof b.href === 'string' && ((b.href[0] === '/' && b.href.slice(0,2) !== '//' && b.href.indexOf('..') < 0) || /^https:\/\/[^\s]+$/i.test(b.href)))) return false;
    return true;
  });
}
