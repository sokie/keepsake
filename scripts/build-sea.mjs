// Builds a single-file executable via Node SEA: the server is bundled with
// esbuild and the built frontend (dist/) travels inside the binary as SEA
// assets. Run `npm run build` (vite) first, or use `npm run package`.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'
import { inject } from 'postject'

const root = process.cwd()
const out = path.join(root, 'build')

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing — run `npm run build` first (or use `npm run package`)')
  process.exit(1)
}

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

console.log('· bundling server with esbuild')
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'build/server.cjs',
  logLevel: 'warning',
})

console.log('· collecting dist/ as SEA assets')
const assets = {}
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else assets[path.relative('dist', p).split(path.sep).join('/')] = p
  }
}
walk('dist')
console.log(`  ${Object.keys(assets).length} assets`)

fs.writeFileSync(
  'build/sea-config.json',
  JSON.stringify(
    {
      main: 'build/server.cjs',
      output: 'build/sea-prep.blob',
      disableExperimentalSEAWarning: true,
      assets,
    },
    null,
    2,
  ),
)

console.log('· generating SEA blob')
execFileSync(process.execPath, ['--experimental-sea-config', 'build/sea-config.json'], { stdio: 'inherit' })

const exe = path.join('build', process.platform === 'win32' ? 'keepsake.exe' : 'keepsake')
console.log(`· creating ${exe} from ${process.execPath}`)
fs.copyFileSync(process.execPath, exe)
fs.chmodSync(exe, 0o755)

if (process.platform === 'darwin') {
  execFileSync('codesign', ['--remove-signature', exe])
}

console.log('· injecting blob')
await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync('build/sea-prep.blob'), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(process.platform === 'darwin' ? { machoSegmentName: 'NODE_SEA' } : {}),
})

if (process.platform === 'darwin') {
  execFileSync('codesign', ['--sign', '-', exe])
}

const mb = (fs.statSync(exe).size / 1024 / 1024).toFixed(1)
console.log(`✓ ${exe} (${mb} MB) — run it and Keepsake opens in your browser; data lives in ~/Keepsake`)
