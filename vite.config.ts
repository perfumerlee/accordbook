// The app intentionally keeps its local HTTPS certificates outside the repository.
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { existsSync, readFileSync } from 'node:fs'
// @ts-expect-error Vite config runs in Node; this project does not ship Node typings.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { cwd(): string }

const certDir = resolve(process.cwd(), 'certs')
const keyFile = resolve(certDir, 'accordbook-key.pem')
const certFile = resolve(certDir, 'accordbook.pem')
const https = existsSync(keyFile) && existsSync(certFile)
  ? { key: readFileSync(keyFile), cert: readFileSync(certFile) }
  : undefined

export default defineConfig({
  base: '/accordbook/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https,
  },
})
