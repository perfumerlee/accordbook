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

// Phase 9F Korean publication guard. Kept server-side so browser bypasses cannot publish stale review state.
function publishTranslationFingerprint_(value) {
  return 'v1:' + Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(publishStable_(value)),
    Utilities.Charset.UTF_8
  ).map(function(b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}
function publishTranslationMeaningful_(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/번역 준비 중/.test(value);
}
function publishTranslationMetadataValid_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (['NOT_STARTED','DRAFT','REVIEW','READY'].indexOf(value.state) < 0) return false;
  var keys = ['translatedFromFingerprint','reviewedAgainstFingerprint','reviewedKoFingerprint'];
  for (var i = 0; i < keys.length; i++) {
    var item = value[keys[i]];
    if (item !== null && (typeof item !== 'string' || !/^v1:[a-f0-9]{64}$/.test(item))) return false;
  }
  if (value.state === 'NOT_STARTED' && value.reviewedAgainstFingerprint !== null) return false;
  if (value.state === 'READY' && (!value.reviewedAgainstFingerprint || !value.reviewedKoFingerprint)) return false;
  return true;
}
function publishProjectTranslationMedia_(media, locale) {
  var byDevice = media && media.variants && media.variants[locale] || {};
  return {
    figureId: media && media.figureId,
    variants: Object.keys(byDevice).map(function(device) {
      var variant = byDevice[device] || {};
      return { device: device, alt: variant.alt || '', caption: variant.caption || '' };
    })
  };
}
function publishProjectEnTranslationBlock_(block) {
  if (block.type === 'divider') return { blockId: block.blockId, type: block.type };
  if (block.type === 'screenshot') return { blockId: block.blockId, type: block.type, media: publishProjectTranslationMedia_(block.media, 'en') };
  if (block.type === 'step') {
    var step = { blockId: block.blockId, type: block.type, step: block.step, text: block.content && block.content.en && block.content.en.text || '' };
    if (block.media) step.media = publishProjectTranslationMedia_(block.media, 'en');
    return step;
  }
  return { blockId: block.blockId, type: block.type, text: block.content && block.content.en && block.content.en.text || '' };
}
function publishProjectKoTranslationBlock_(block) {
  if (block.type === 'divider') return { blockId: block.blockId, type: block.type };
  if (block.type === 'screenshot') return { blockId: block.blockId, type: block.type, media: publishProjectTranslationMedia_(block.media, 'ko') };
  if (block.type === 'step') {
    var step = { blockId: block.blockId, type: block.type, step: block.step, text: block.content && block.content.ko && block.content.ko.text || '' };
    if (block.media) step.media = publishProjectTranslationMedia_(block.media, 'ko');
    return step;
  }
  return { blockId: block.blockId, type: block.type, text: block.content && block.content.ko && block.content.ko.text || '' };
}
function publishEnTranslationFingerprint_(document) {
  return publishTranslationFingerprint_({
    version: 1,
    locale: {
      title: document.locales.en.title,
      subtitle: document.locales.en.subtitle,
      seo: { title: document.locales.en.seo.title, description: document.locales.en.seo.description }
    },
    blocks: document.blocks.map(publishProjectEnTranslationBlock_)
  });
}
function publishKoTranslationFingerprint_(document) {
  var ko = document.locales.ko || {};
  return publishTranslationFingerprint_({
    version: 1,
    locale: {
      title: ko.title || '',
      subtitle: ko.subtitle || '',
      seo: { title: ko.seo && ko.seo.title || '', description: ko.seo && ko.seo.description || '' }
    },
    blocks: document.blocks.map(publishProjectKoTranslationBlock_)
  });
}
function validateKoTranslationReadyForPublish_(document) {
  var ko = document && document.locales && document.locales.ko;
  var metadata = ko && ko.translation;
  if (!ko || !publishTranslationMetadataValid_(metadata) || metadata.state !== 'READY') return false;
  if (!publishTranslationMeaningful_(ko.title) || !publishTranslationMeaningful_(ko.subtitle) || !ko.seo || !publishTranslationMeaningful_(ko.seo.title) || !publishTranslationMeaningful_(ko.seo.description)) return false;

  for (var i = 0; i < document.blocks.length; i++) {
    var block = document.blocks[i];
    if (block.type !== 'divider' && Object.prototype.hasOwnProperty.call(block, 'content')) {
      if (!block.content || !block.content.ko || !publishTranslationMeaningful_(block.content.ko.text)) return false;
    }
    if (block.type === 'screenshot' || block.type === 'step' && block.media) {
      var media = block.type === 'screenshot' ? block.media : block.media;
      var enVariants = media && media.variants && media.variants.en || {};
      var koVariants = media && media.variants && media.variants.ko || {};
      var devices = Object.keys(enVariants);
      for (var j = 0; j < devices.length; j++) {
        var variant = koVariants[devices[j]];
        if (!variant || !publishTranslationMeaningful_(variant.alt) || !publishTranslationMeaningful_(variant.caption)) return false;
      }
    }
  }

  var enFingerprint = publishEnTranslationFingerprint_(document);
  var koFingerprint = publishKoTranslationFingerprint_(document);
  return metadata.translatedFromFingerprint === enFingerprint &&
    metadata.reviewedAgainstFingerprint === enFingerprint &&
    metadata.reviewedKoFingerprint === koFingerprint;
}
