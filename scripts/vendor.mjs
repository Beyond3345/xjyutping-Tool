// Assembles the generated parts of the app before `vite` and `vite build`:
//   public/pyodide/         the Pyodide runtime (from node_modules/pyodide)
//   public/py.zip           py/app.py, py/fonts.json, py/glyphs/, versions.json and the xjyutping package
//   src-tauri/resources/texbundle/   TeX Live subset, xjyutping.sty and data, the fonts of py/fonts.json
//                                    with their licences (tex/fonts/), SHA256SUM
//   src-tauri/binaries/tectonic-<target triple>   the TeX engine
// The xjyutping packages are read from the sibling repositories (XJYUTPING_PY and
// XJYUTPING_TEX override the paths); downloads are pinned by sha256 and cached in .downloads/.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PY = path.resolve(process.env.XJYUTPING_PY ?? path.join(root, '..', 'xjyutping-py'))
const TEX = path.resolve(process.env.XJYUTPING_TEX ?? path.join(root, '..', 'xjyutping-tex'))
const CACHE = path.join(root, '.downloads')
const TAR = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar' // bsdtar on both: reads and writes zip

const TECTONIC = 'https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-'
const FILES = {
  'aarch64-apple-darwin': [`${TECTONIC}aarch64-apple-darwin.tar.gz`, 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'],
  'x86_64-apple-darwin': [`${TECTONIC}x86_64-apple-darwin.tar.gz`, '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'],
  'x86_64-pc-windows-msvc': [`${TECTONIC}x86_64-pc-windows-msvc.zip`, 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'],
}
// the fonts the teacher chooses from; those of TeX Live are already in tex/tl2024/, and those
// marked system are commercial fonts the teacher installs
const FONTS = JSON.parse(fs.readFileSync(path.join(root, 'py', 'fonts.json'), 'utf8')).filter(f => !f.texlive && !f.system)
for (const f of FONTS) FILES[path.basename(new URL(f.url).pathname)] = [f.url, f.archiveSha256 ?? f.sha256]

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] })

function fresh(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function download(name) {
  if (!FILES[name]) throw new Error(`nothing pinned for ${name}`)
  const [url, hash] = FILES[name]
  const file = path.join(CACHE, name)
  if (fs.existsSync(file) && sha256(file) === hash) return file
  fs.mkdirSync(CACHE, { recursive: true })
  console.log(`vendor: downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  if (sha256(file) !== hash) throw new Error(`${name}: sha256 mismatch, expected ${hash}`)
  return file
}

function texVersion() {
  const m = fs.readFileSync(path.join(TEX, 'xjyutping.sty'), 'utf8').match(/\\ProvidesExplPackage\{xjyutping\}\{[^}]*\}\{([^}]*)\}/)
  return m ? m[1] : 'unknown'
}

function pyodide() {
  const out = fresh(path.join(root, 'public', 'pyodide'))
  for (const f of ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
    fs.copyFileSync(path.join(root, 'node_modules', 'pyodide', f), path.join(out, f))
  }
}

function pyZip() {
  const stage = fresh(path.join(CACHE, 'py'))
  fs.cpSync(path.join(PY, 'src', 'xjyutping'), path.join(stage, 'xjyutping'), {
    recursive: true, filter: src => !src.includes('__pycache__'),
  })
  fs.copyFileSync(path.join(root, 'py', 'app.py'), path.join(stage, 'app.py'))
  fs.copyFileSync(path.join(root, 'py', 'fonts.json'), path.join(stage, 'fonts.json'))
  fs.cpSync(path.join(root, 'py', 'glyphs'), path.join(stage, 'glyphs'), { recursive: true })
  fs.writeFileSync(path.join(stage, 'versions.json'), JSON.stringify({ xjyutping_tex: texVersion() }))
  const zip = path.join(root, 'public', 'py.zip')
  fs.rmSync(zip, { force: true })
  // stored, not deflated, so that Tauri's brotli compresses the tables better
  run(TAR, ['-a', '--options', 'zip:compression=store', '-cf', zip, '-C', stage, '.'])
}

/** a font of py/fonts.json in .downloads/, taken out of its archive when it comes in one */
async function font(f) {
  const archive = await download(path.basename(new URL(f.url).pathname))
  if (!f.member) return archive
  const dir = path.join(CACHE, `font-${f.id}`)
  const file = path.join(dir, path.basename(f.member))
  if (fs.existsSync(file) && sha256(file) === f.sha256) return file
  run(TAR, ['-xf', archive, '-C', fresh(dir), '--strip-components', String(f.member.split('/').length - 1), f.member])
  if (sha256(file) !== f.sha256) throw new Error(`${f.member}: sha256 mismatch, expected ${f.sha256}`)
  return file
}

async function texbundle() {
  const out = fresh(path.join(root, 'src-tauri', 'resources', 'texbundle'))
  const tl = path.join(root, 'tex', 'tl2024')
  if (fs.existsSync(tl)) for (const f of fs.readdirSync(tl)) fs.copyFileSync(path.join(tl, f), path.join(out, f))
  else console.warn('vendor: tex/tl2024/ is missing; run scripts/harvest_bundle.py')
  for (const f of ['xjyutping.sty', 'xjyutping-chars.def', 'xjyutping-words.def']) {
    fs.copyFileSync(path.join(TEX, f), path.join(out, f))
  }
  for (const f of FONTS) fs.copyFileSync(await font(f), path.join(out, f.file))
  // the fonts' licences travel with them
  for (const f of fs.readdirSync(path.join(root, 'tex', 'fonts'))) {
    fs.copyFileSync(path.join(root, 'tex', 'fonts', f), path.join(out, f))
  }
  // readable by every user of a shared machine, whatever the mode of the source
  for (const f of fs.readdirSync(out)) fs.chmodSync(path.join(out, f), 0o644)
  // Tectonic keys its format cache on this digest, so any change rebuilds the format
  const lines = fs.readdirSync(out).sort().map(f => `${f} ${sha256(path.join(out, f))}\n`).join('')
  fs.writeFileSync(path.join(out, 'SHA256SUM'), createHash('sha256').update(lines).digest('hex'))
}

async function tectonic(triple) {
  const dir = path.join(root, 'src-tauri', 'binaries')
  fs.mkdirSync(dir, { recursive: true })
  const unpack = async t => {
    const into = fresh(path.join(CACHE, `tectonic-${t}`))
    run(TAR, ['-xf', await download(t), '-C', into])
    return path.join(into, t.includes('windows') ? 'tectonic.exe' : 'tectonic')
  }
  if (triple === 'universal-apple-darwin') {
    // the universal build compiles each architecture with its own sidecar, then bundles the merged one
    const parts = []
    for (const t of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
      parts.push(await unpack(t))
      fs.copyFileSync(parts.at(-1), path.join(dir, `tectonic-${t}`))
    }
    run('lipo', ['-create', ...parts, '-output', path.join(dir, `tectonic-${triple}`)])
  } else if (FILES[triple]) {
    fs.copyFileSync(await unpack(triple), path.join(dir, `tectonic-${triple}${triple.includes('windows') ? '.exe' : ''}`))
  } else {
    throw new Error(`no Tectonic build pinned for ${triple}`)
  }
}

const triple = process.env.TAURI_ENV_TARGET_TRIPLE
  || execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim()
pyodide()
pyZip()
await texbundle()
await tectonic(triple)
console.log(`vendor: ready for ${triple} (xjyutping-py from ${PY}, xjyutping-tex ${texVersion()} from ${TEX})`)
