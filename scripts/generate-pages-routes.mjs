import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = process.cwd()
const distIndex = join(root, 'dist', 'index.html')

async function createRouteShell(route) {
  const target = join(root, 'dist', route, 'index.html')
  await mkdir(dirname(target), { recursive: true })
  await copyFile(distIndex, target)
}

await createRouteShell('drop')

// Public package directories are a stable, repository-local source for known
// detail entry shells. Future API-only Drops continue through 404.html.
const publicDrops = join(root, 'public', 'formula-drops')
for (const entry of await readdir(publicDrops, { withFileTypes: true })) {
  if (entry.isDirectory() && /^\d{4}-\d{3}$/.test(entry.name)) await createRouteShell(`drop/${entry.name}`)
}
