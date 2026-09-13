import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readArchives, renderPage, sitemap } from './formula-drop-archive.mjs'
import { generateOg } from './generate-formula-drop-og.mjs'
import { generateGuideRoutes, guideSitemapEntries } from './guide-static.mjs'
import { copyGuideAssets, validateGuideDocumentAssets } from './guide-assets.mjs'

export async function generatePages(root = process.cwd()) {
  const archives = await readArchives(join(root,'public/formula-drops'))
  const shell = await readFile(join(root,'dist/index.html'),'utf8')
  if (!shell.includes('src="/assets/') || !shell.includes('href="/assets/')) throw new Error('Static Drop pages require root-relative Vite assets')
  for (const drop of [null,...archives]) {
    const target = join(root,'dist/drop',drop?.slug || '', 'index.html')
    await mkdir(dirname(target),{recursive:true})
    await writeFile(target,renderPage(shell,drop,archives))
    const imageDir = join(root,'dist/formula-drops',drop?.slug || 'archive')
    await mkdir(imageDir,{recursive:true})
    await generateOg(drop || {title:'Formula Drop Archive',subtitle:'Published formulas for perfumers.'},join(root,'public/formula-drops',drop?.slug || 'archive','og-source.png'),join(imageDir,'og.png'))
  }
  const operatorShell = shell.replace('</head>', '<meta name="robots" content="noindex, nofollow" />\n  </head>')
  await mkdir(join(root,'dist/operator/formula-storage'),{recursive:true})
  await writeFile(join(root,'dist/operator/formula-storage/index.html'),operatorShell)
  await mkdir(join(root,'dist/operator/guide'),{recursive:true})
  await writeFile(join(root,'dist/operator/guide/index.html'),operatorShell)
  const guide = await generateGuideRoutes(root, shell)
  if (guide.documents.length) await validateGuideDocumentAssets(root, guide.documents)
  await copyGuideAssets(root, guide.documents)
  const guideUrls = ['/guide/en/', '/guide/ko/', ...guideSitemapEntries(guide.documents)]
  const baseSitemap = sitemap(archives).replace('</urlset>', guideUrls.map(url => `<url><loc>${url}</loc></url>`).join('') + '</urlset>')
  await writeFile(join(root,'dist/sitemap.xml'),baseSitemap)
  return archives.length
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Generated permanent Formula Drop archives: ' + await generatePages())
}
