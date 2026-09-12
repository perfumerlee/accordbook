// @ts-nocheck -- these tests execute the Node build pipeline, outside the app TS project.
import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { validateArchives, renderPage, sitemap, readArchives } from '../scripts/formula-drop-archive.mjs'
import { generateOg, layoutOg, textPath } from '../scripts/generate-formula-drop-og.mjs'
import { generatePages } from '../scripts/generate-pages-routes.mjs'
import { archiveDrops, mergeArchiveDrops } from '../src/services/formulaDropArchive'

const drop = { slug:'2026-002',title:'Apple / Study',subtitle:'A public study.',description:'FORMULA COMPOSITION\nMaterial A\nDPG\n-----\nPublic notes.',expiresAt:'2020-01-01T00:00:00.000Z' }
const shell = '<html><head><title>Accordbook</title><script src="/assets/main.js"></script><link href="/assets/main.css"></head><body><div id="root"></div></body></html>'
describe('Permanent public archive',()=>{
  it('accepts public content and preserves expired entries in the sitemap',()=>{
    expect(validateArchives([drop])).toEqual([drop]); expect(sitemap([drop])).toContain('/drop/2026-002'); expect(sitemap([drop])).not.toContain('lastmod')
  })
  it.each(['accessName','accessLast4','accessPin','parts','cas','licenseId','fileUrl','seller','encryptedPayload'])('rejects private/unsupported %s fields',key=>{
    expect(()=>validateArchives([{...drop,[key]:'private'}])).toThrow()
  })
  it('rejects traversal, duplicate slugs, missing titles and invalid dates',()=>{
    expect(()=>validateArchives([{...drop,slug:'../foo'}])).toThrow()
    expect(()=>validateArchives([drop,drop])).toThrow()
    expect(()=>validateArchives([{...drop,title:''}])).toThrow()
    expect(()=>validateArchives([{...drop,expiresAt:'yesterday'}])).toThrow()
  })
  it('renders semantic public HTML, canonical and social metadata without JS',()=>{
    const html = renderPage(shell,drop,[drop])
    for(const value of ['<h1>Apple / Study</h1>','Formula Composition','<li>Material A</li>','Public notes.','Publication archive','https://accordbook.org/drop/2026-002','og:title','og:description','og:type','og:url','og:image:width','og:image:alt','summary_large_image','application/ld+json','CreativeWork']) expect(html).toContain(value)
    expect(html).not.toContain('DOWNLOAD FORMULA'); expect(html).toContain('/assets/main.js')
  })
  it('escapes HTML, attributes and JSON-LD script termination',()=>{
    const html=renderPage(shell,{...drop,title:'<img "x"> & </script><script>bad()</script>'},[drop])
    expect(html).not.toContain('<script>bad()'); expect(html).toContain('&lt;img &quot;x&quot;&gt;'); expect(html).toContain('\\u003c')
  })
  it('keeps archive entries linked when live API omits them and lets live status win',()=>{
    const saved=archiveDrops()[0]; expect(saved.status).toBe('EXPIRED')
    expect(mergeArchiveDrops([])).toContainEqual(saved)
    expect(mergeArchiveDrops([{...saved,status:'ACTIVE'}]).find(d=>d.dropId===saved.dropId).status).toBe('ACTIVE')
  })
  it.each(['Study','Mcintosh Apple / Simplified Study','An extended public formula study exploring material relationships and composition across several variations','Apple & Pear — “Study”'])('wraps OG title legibly: %s',async title=>{
    const layout=await layoutOg({...drop,title}); expect(layout.size).toBeGreaterThanOrEqual(34)
    expect(layout.lines.length).toBeLessThanOrEqual(4)
    for(const line of layout.lines) {
      expect(layout.font.getAdvanceWidth(line,layout.size,{kerning:false})).toBeLessThanOrEqual(1040)
      expect(textPath(layout.font,line,80,204,layout.size,'#332d27').includes('NaN')).toBe(false)
    }
  })
  it('generates auto PNG and validates/normalizes a custom override',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'accordbook-og-'))
    try {
      const out=join(dir,'og.png'), custom=join(dir,'og-source.png')
      expect(await generateOg({...drop,subtitle:''},custom,out)).toBe('AUTO')
      expect(await sharp(out).metadata()).toMatchObject({format:'png',width:1200,height:630})
      await sharp({create:{width:800,height:800,channels:3,background:'#e8e1d5'}}).png().toFile(custom)
      expect(await generateOg(drop,custom,out)).toBe('CUSTOM')
      expect(await sharp(out).metadata()).toMatchObject({width:1200,height:630})
      await writeFile(custom,'invalid'); await expect(generateOg(drop,custom,out)).rejects.toThrow()
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
  it('builds future static routes and sitemap offline from metadata',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'accordbook-archive-'))
    try {
      await mkdir(join(dir,'public/formula-drops/2026-002'),{recursive:true}); await mkdir(join(dir,'dist'))
      await writeFile(join(dir,'public/formula-drops/2026-002/drop.json'),JSON.stringify(drop))
      await writeFile(join(dir,'dist/index.html'),shell)
      expect(await generatePages(dir)).toBe(1)
      expect(await readFile(join(dir,'dist/drop/index.html'),'utf8')).toContain('href="/drop/2026-002"')
      expect(await readFile(join(dir,'dist/drop/2026-002/index.html'),'utf8')).toContain('<h1>Apple / Study</h1>')
      expect(await readFile(join(dir,'dist/sitemap.xml'),'utf8')).toContain('/drop/2026-002')
      await writeFile(join(dir,'public/formula-drops/2026-002/drop.json'),JSON.stringify({...drop,slug:'2026-003'}))
      await expect(readArchives(join(dir,'public/formula-drops'))).rejects.toThrow()
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
})
