// The app intentionally keeps its local HTTPS certificates outside the repository.
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { existsSync, readFileSync } from 'node:fs'
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { resolve } from 'node:path'
// @ts-expect-error Vite config runs in Node without bundled Node typings.
import { URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error Vite config imports a Node-only helper without bundled Node typings.
import { createReadStream } from 'node:fs'
// @ts-expect-error Vite config runs in Node without bundled Node typings.
import { realpath } from 'node:fs/promises'
// @ts-expect-error Vite config imports a Node-only helper without bundled Node typings.
import { validateGuideAssetPath, isContained, inspectGuideAsset, assetMime } from './scripts/guide-assets.mjs'
// @ts-expect-error Local Node middleware helper has no bundled declaration file.
import { forwardGuideDraft } from './scripts/guide-draft-proxy.mjs'
// @ts-expect-error Local staging helper has no bundled declaration file.
import { stageGuideAsset, listStagedGuideAssets, readStagedGuideAsset, deleteStagedGuideAsset, parseGuideMultipart, maxBytes } from './scripts/guide-asset-staging.mjs'
// @ts-expect-error Local Node catalog helper has no bundled declaration file.
import { listPublishedGuideAssets } from './scripts/guide-asset-catalog.mjs'

// @ts-expect-error Local Node publish orchestration.
import { forwardAtomicPublish } from './scripts/guide-atomic-publish-proxy.mjs'
// @ts-expect-error Local bounded asset bundle.
import { collectPublishBundle } from './scripts/guide-publish-bundle.mjs'

declare const process: { cwd(): string }
declare const Buffer: any

const certDir = resolve(process.cwd(), 'certs')
const keyFile = resolve(certDir, 'accordbook-key.pem')
const certFile = resolve(certDir, 'accordbook.pem')
const https = existsSync(keyFile) && existsSync(certFile)
  ? { key: readFileSync(keyFile), cert: readFileSync(certFile) }
  : undefined

function guideDevAssets() {
  const root = resolve(process.cwd(), 'content/guide/assets')
  return { name: 'guide-dev-assets', configureServer(server: { middlewares: { use: Function } }) { server.middlewares.use(async (req: any, res: any, next: any) => { if (!req.url?.startsWith('/guide/assets/')) return next(); const src = decodeURIComponent(req.url.split('?')[0].slice('/guide/'.length)); const file = resolve(root, src.slice('assets/'.length)); try { if (!validateGuideAssetPath(src) || !isContained(root, file) || !isContained(root, await realpath(file))) return res.statusCode = 404, res.end(); await inspectGuideAsset(file); res.setHeader('Content-Type', assetMime(src)); createReadStream(file).pipe(res) } catch { res.statusCode = 404; res.end() } }) } }
}

function guideDraftDevProxy(target: string) {
  return { name: 'guide-draft-dev-proxy', configureServer(server: { middlewares: { use: Function } }) {
    server.middlewares.use((req: any, res: any, next: any) => {
      if (req.url?.split('?')[0] !== '/api/guide-drafts' || req.method !== 'POST') return next()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Guide-Proxy', 'local')
      if (!target) { res.statusCode = 503; return res.end(JSON.stringify({ ok: false, code: 'NETWORK_ERROR' })) }
      const chunks: any[] = []
      let bytes = 0
      req.on('data', (chunk: any) => { bytes += chunk.length; if (bytes <= 4000000) chunks.push(chunk) })
      req.on('end', async () => {
        try {
          if (bytes > 4000000) { res.statusCode = 413; return res.end(JSON.stringify({ok:false,code:'ASSET_AGGREGATE_TOO_LARGE'})) }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const result = body.action === 'publishGuide' ? await forwardAtomicPublish(target, body) : await forwardGuideDraft(target, Buffer.concat(chunks))
          res.statusCode = result.status
          res.end(result.body)
        } catch (error) {
          res.statusCode = error instanceof Error && /^(STAGED_|ASSET_)[A-Z_]+$/.test(error.message) ? 200 : 502
          res.end(JSON.stringify({ ok: false, code: error instanceof Error && /^(STAGED_|ASSET_)[A-Z_]+$/.test(error.message) ? error.message : 'NETWORK_ERROR' }))
        }
      })
    })
  } }
}

function guideAssetReadiness() { return { name:'guide-asset-readiness', configureServer(server: { middlewares: { use: Function } }) { server.middlewares.use((req:any,res:any,next:any)=>{ if(req.url!=='/api/guide-assets-readiness'||req.method!=='POST')return next(); let size=0;const chunks:any[]=[];req.on('data',(c:any)=>{size+=c.length;if(size<=200000)chunks.push(c)});req.on('end',async()=>{res.setHeader('Content-Type','application/json');try{if(size>200000)throw Error('ASSET_AGGREGATE_TOO_LARGE');const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));const bundle=await collectPublishBundle({guideId:body.guideId,blocks:[{media:{variants:{en:Object.fromEntries((body.refs as string[]).map((src,i)=>[i,{src}]))}}}]});res.end(JSON.stringify({ok:true,count:bundle.length}))}catch(e){res.end(JSON.stringify({ok:false,code:e instanceof Error&&/^(ASSET_|STAGED_|INVALID_GUIDE_)[A-Z_]+$/.test(e.message)?e.message:'ASSET_READINESS_FAILED'}))}})})}} }
function guideAssetCatalog() { return { name: 'guide-asset-catalog', configureServer(server: { middlewares: { use: Function } }) { server.middlewares.use(async (req: any, res: any, next: any) => { if (req.url !== '/api/guide-asset-catalog') return next(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, assets: await listPublishedGuideAssets() })) }) } } }
function guideAssetStaging() { return { name: 'guide-asset-staging', configureServer(server: { middlewares: { use: Function } }) { server.middlewares.use(async (req: any, res: any, next: any) => { if (!req.url?.startsWith('/api/guide-assets')) return next(); res.setHeader('Cache-Control', 'no-store'); try { const url = new URL(req.url, 'https://localhost'); if (req.method === 'GET' && url.pathname === '/api/guide-assets') return res.end(JSON.stringify({ ok: true, assets: await listStagedGuideAssets() })); const match = /^\/api\/guide-assets(?:\/([^/]+))?\/?$/.exec(url.pathname); if (!match || (req.method !== 'POST' && !match[1])) throw Error('STAGED_ASSET_NOT_FOUND'); const id = match[1]; if (req.method === 'GET') { const { asset, bytes } = await readStagedGuideAsset(id); res.setHeader('Content-Type', asset.mimeType); res.end(bytes); return } if (req.method === 'DELETE') { res.end(JSON.stringify({ ok: true, asset: await deleteStagedGuideAsset(id) })); return } if (req.method !== 'POST') return next(); const chunks: any[] = []; let total = 0; req.on('data', (chunk: any) => { total += chunk.length; if (total <= maxBytes + 1024 * 1024) chunks.push(chunk) }); req.on('end', async () => { try { if (total > maxBytes + 1024 * 1024) throw Error('IMAGE_TOO_LARGE'); const parsed = parseGuideMultipart(req.headers['content-type'] || '', Buffer.concat(chunks)); const asset = await stageGuideAsset({ ...parsed.fields, mimeType: parsed.file.contentType, bytes: parsed.file.value, originalFileName: parsed.file.filename }); res.end(JSON.stringify({ ok: true, asset })) } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, code: (e instanceof Error ? e.message : 'STAGING_WRITE_FAILED') })) } }); } catch (e) { res.statusCode = 404; res.end(JSON.stringify({ ok: false, code: (e instanceof Error ? e.message : 'STAGED_ASSET_NOT_FOUND') })) } }) } } }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  base: '/',
  plugins: [react(), guideDevAssets(), guideDraftDevProxy(env.VITE_GUIDE_DRAFT_ENDPOINT?.trim() ?? ''), guideAssetCatalog(), guideAssetReadiness(), guideAssetStaging()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https,
  },
  }
})
