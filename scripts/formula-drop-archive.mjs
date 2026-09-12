import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parsePublicDropContent } from '../src/services/formulaDropContent.mjs'

export const origin = 'https://accordbook.org'
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const allowed = new Set(['slug', 'title', 'subtitle', 'summary', 'description', 'publishedAt', 'updatedAt', 'expiresAt'])
export function validateArchives(values) {
  const seen = new Set()
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Archive must be an object')
    if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('Archive contains unsupported or private fields')
    if (!/^\d{4}-\d{3}$/.test(value.slug || '') || seen.has(value.slug)) throw new Error('Invalid or duplicate archive slug')
    seen.add(value.slug)
    for (const key of Object.keys(value)) if (typeof value[key] !== 'string') throw new Error('Archive fields must be public strings')
    if (!value.title?.trim() || !value.description?.trim()) throw new Error('Archive title and description are required')
    for (const key of ['publishedAt', 'updatedAt', 'expiresAt']) if (value[key] && (!/^\d{4}-\d{2}-\d{2}T/.test(value[key]) || !Number.isFinite(Date.parse(value[key])))) throw new Error('Invalid archive date')
  }
  return values
}
export async function readArchives(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^\d{4}-\d{3}$/.test(entry.name)) continue
    // Fail for missing metadata: a public package directory must be explicitly archived.
    const value = JSON.parse(await readFile(join(directory, entry.name, 'drop.json'), 'utf8'))
    if (value.slug !== entry.name) throw new Error('Archive slug must match directory')
    result.push(value)
  }
  return validateArchives(result)
}
export function descriptionFor(drop) {
  const text = (drop.summary || drop.subtitle || parsePublicDropContent(drop.description).notes || drop.title).replace(/\s+/g, ' ').trim()
  if (text.length <= 170) return text
  const boundary = text.lastIndexOf(' ', 167)
  return text.slice(0, boundary > 0 ? boundary : 167) + '…'
}
export function pageMetadata(drop) {
  const url = origin + '/drop' + (drop ? '/' + drop.slug : '')
  const title = drop ? `${drop.title} — Formula Drop ${drop.slug} | Accordbook` : 'Formula Drop Archive — Accordbook'
  const description = drop ? descriptionFor(drop) : 'Explore published formula studies, accords and public compositions in the permanent Accordbook Formula Drop archive.'
  const image = origin + '/formula-drops/' + (drop ? drop.slug : 'archive') + '/og.png'
  const alt = drop ? `Formula Drop ${drop.slug} — ${drop.title}` : 'Formula Drop Archive — Accordbook'
  const tags = [['name','description',description],['property','og:title',title],['property','og:description',description],['property','og:type',drop ? 'article' : 'website'],['property','og:url',url],['property','og:image',image],['property','og:image:width','1200'],['property','og:image:height','630'],['property','og:image:alt',alt],['name','twitter:card','summary_large_image'],['name','twitter:title',title],['name','twitter:description',description],['name','twitter:image',image],['name','twitter:image:alt',alt]]
  const structured = drop ? { '@context':'https://schema.org', '@type':'CreativeWork', name:drop.title, description, url, image, publisher:{'@type':'Organization',name:'Accordbook'}, ...(drop.publishedAt ? {datePublished:drop.publishedAt}:{}), ...(drop.updatedAt ? {dateModified:drop.updatedAt}:{}) } : null
  return `<title>${escapeHtml(title)}</title>\n<link rel="canonical" href="${url}">\n` + tags.map(([kind,key,value]) => `<meta ${kind}="${key}" content="${escapeHtml(value)}">`).join('\n') + (structured ? `\n<script type="application/ld+json">${JSON.stringify(structured).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')}</script>` : '')
}
export function archiveBody(drop) {
  const { composition, notes } = parsePublicDropContent(drop.description)
  return `<article><header><p>Formula Drop ${escapeHtml(drop.slug)}</p><h1>${escapeHtml(drop.title)}</h1>${drop.subtitle ? `<p>${escapeHtml(drop.subtitle)}</p>` : ''}</header>${drop.summary ? `<p>${escapeHtml(drop.summary)}</p>` : ''}<section><h2>Formula Composition</h2><ol>${composition.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ol></section>${notes ? `<section><h2>Notes</h2><p class="archive-prose">${escapeHtml(notes)}</p></section>` : ''}<section><h2>Publication archive</h2><p>This published Formula Drop remains available for reference after its download period ends.</p>${drop.expiresAt ? `<p>Download period ends: <time datetime="${escapeHtml(drop.expiresAt)}">${escapeHtml(drop.expiresAt.replace('T',' ').replace('.000Z',' UTC'))}</time>.</p>` : ''}<p>Current download availability is checked by Accordbook when the application opens.</p></section></article>`
}
export function renderPage(shell, drop, archives) {
  const body = drop ? archiveBody(drop) : `<h1>Formula Drop Archive</h1><p>Published formulas for perfumers. Public compositions remain available after download periods end.</p><ol>${archives.map(item=>`<li><a href="/drop/${item.slug}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.subtitle || '')}</p></li>`).join('')}</ol>`
  return shell.replace(/<title>[\s\S]*?<\/title>/,pageMetadata(drop)).replace('<div id="root"></div>', `<div id="root"><main class="static-archive"><nav><a href="/">Accordbook</a> · <a href="/drop">All Drops</a></nav>${body}<footer><a href="/">Open Accordbook</a></footer></main></div>`).replace('</head>', '<style>.static-archive{max-width:960px;margin:auto;padding:48px 28px;color:#332d27;font:18px/1.7 Georgia,serif}.static-archive h1{font-size:48px;line-height:1.2;font-weight:normal}.static-archive section{margin:56px 0}.static-archive h2{font:13px monospace;text-transform:uppercase;letter-spacing:.1em}.static-archive li{padding:14px 0;border-bottom:1px solid #c8bdad}.static-archive a{color:#6f527f}.archive-prose{white-space:pre-line}</style></head>')
}
export function sitemap(archives) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + [{url:origin+'/'},{url:origin+'/drop'},...archives.map(drop=>({url:origin+'/drop/'+drop.slug,updatedAt:drop.updatedAt}))].map(item=>`<url><loc>${item.url}</loc>${item.updatedAt ? `<lastmod>${escapeHtml(item.updatedAt)}</lastmod>` : ''}</url>`).join('') + '</urlset>\n'
}
