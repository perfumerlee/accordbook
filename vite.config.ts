// The app intentionally keeps its local HTTPS certificates outside the repository.
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { existsSync, readFileSync } from 'node:fs'
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error Vite config imports a Node-only helper without bundled Node typings.
import { createReadStream } from 'node:fs'
// @ts-expect-error Vite config runs in Node without bundled Node typings.
import { realpath } from 'node:fs/promises'
// @ts-expect-error Vite config imports a Node-only helper without bundled Node typings.
import { validateGuideAssetPath, isContained, inspectGuideAsset, assetMime } from './scripts/guide-assets.mjs'

declare const process: { cwd(): string }

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

export default defineConfig({
  base: '/',
  plugins: [react(), guideDevAssets()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https,
  },
})
