// Runtime-compatible verifier for the pure 8F.2B merge contract.
function refreshEqual_(a, b) { if (a === b) return true; if (a === undefined || b === undefined || a === null || b === null) return false; if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function(v, i) { return refreshEqual_(v, b[i]); }); if (typeof a === 'object' && typeof b === 'object') { var ak = Object.keys(a).sort(), bk = Object.keys(b).sort(); return ak.length === bk.length && ak.every(function(k, i) { return k === bk[i] && refreshEqual_(a[k], b[k]); }); } return false; }
function refreshClone_(v) { return JSON.parse(JSON.stringify(v)); }
function refreshConflict_(kind, path, base, local, remote, blockId) { return { conflictId: kind + ':' + path, kind: kind, blockId: blockId, fieldPath: path, baseValue: refreshClone_(base), localValue: refreshClone_(local), remoteValue: refreshClone_(remote) }; }
function refreshMergeValue_(base, local, remote, path, conflicts, blockId) {
  if (refreshEqual_(local, remote)) return refreshClone_(local);
  if (refreshEqual_(local, base)) return refreshClone_(remote);
  if (refreshEqual_(remote, base)) return refreshClone_(local);
  if (base && local && remote && typeof base === 'object' && typeof local === 'object' && typeof remote === 'object' && !Array.isArray(base) && !Array.isArray(local) && !Array.isArray(remote)) {
    var keys = {}; Object.keys(base).concat(Object.keys(local), Object.keys(remote)).forEach(function(k) { keys[k] = true; }); var out = {};
    Object.keys(keys).sort().forEach(function(k) { if (local[k] === undefined && remote[k] === undefined) return; out[k] = refreshMergeValue_(base[k], local[k], remote[k], path + '.' + k, conflicts, blockId); }); return out;
  }
  conflicts.push(refreshConflict_('field-edit', path, base, local, remote, blockId)); return refreshClone_(local);
}
function refreshBlocks_(base, local, remote, conflicts) {
  var bm = {}, lm = {}, rm = {}; base.forEach(function(x) { bm[x.blockId] = x; }); local.forEach(function(x) { lm[x.blockId] = x; }); remote.forEach(function(x) { rm[x.blockId] = x; }); var ids = {}; base.concat(local, remote).forEach(function(x) { ids[x.blockId] = true; }); var merged = {};
  Object.keys(ids).forEach(function(id) { var b = bm[id], l = lm[id], r = rm[id]; if (!b) { if (!l) merged[id] = refreshClone_(r); else if (!r || refreshEqual_(l, r)) merged[id] = refreshClone_(l); else { conflicts.push(refreshConflict_('add-add', 'blocks.' + id, undefined, l, r, id)); merged[id] = refreshClone_(l); } return; } if (!l && !r) return; if (!l) { if (!refreshEqual_(r, b)) conflicts.push(refreshConflict_('delete-edit', 'blocks.' + id, b, undefined, r, id)); return; } if (!r) { if (!refreshEqual_(l, b)) conflicts.push(refreshConflict_('edit-delete', 'blocks.' + id, b, l, undefined, id)); else return; } merged[id] = refreshMergeValue_(b, l, r, 'blocks.' + id, conflicts, id); });
  var bo = base.map(function(x) { return x.blockId; }), lo = local.map(function(x) { return x.blockId; }), ro = remote.map(function(x) { return x.blockId; }), order = bo.filter(function(id) { return merged[id]; }); var lc = !refreshEqual_(lo, bo), rc = !refreshEqual_(ro, bo);
  if (lc && !rc) order = lo.filter(function(id) { return merged[id]; }); else if (!lc && rc) order = ro.filter(function(id) { return merged[id]; }); else if (lc && rc) { if (refreshEqual_(lo, ro)) order = lo.filter(function(id) { return merged[id]; }); else conflicts.push(refreshConflict_('order', 'blocks.order', bo, lo, ro)); }
  [lo, ro].forEach(function(source) { source.forEach(function(id, index) { if (order.indexOf(id) >= 0 || bo.indexOf(id) >= 0 || !merged[id]) return; var gap = source.slice(0, index).filter(function(x) { return bo.indexOf(x) >= 0; }).length; order.splice(Math.min(gap, order.length), 0, id); }); });
  return order.map(function(id) { return merged[id]; });
}
function mergeGuideDocumentsServer_(base, local, remote) {
  var conflicts = [], b = refreshClone_(base), l = refreshClone_(local), r = refreshClone_(remote), bb = b.blocks, lb = l.blocks, rb = r.blocks; delete b.blocks; delete l.blocks; delete r.blocks; var document = refreshMergeValue_(b, l, r, 'document', conflicts); document.blocks = refreshBlocks_(bb, lb, rb, conflicts); conflicts.sort(function(a, z) { return a.conflictId < z.conflictId ? -1 : a.conflictId > z.conflictId ? 1 : 0; }); return { document: document, conflicts: conflicts };
}
