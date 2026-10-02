// Assembles the generated parts of the app before `vite` and `vite build`:
//   public/pyodide/         the Pyodide runtime (from node_modules/pyodide)
//   public/py.zip           py/app.py, py/glyphs.txt, versions.json and the xjyutping package
//   src-tauri/resources/texbundle/   TeX Live subset, xjyutping.sty and data, fonts, SHA256SUM
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
  'I.Ming-8.10.ttf': ['https://github.com/ichitenfont/I.Ming/releases/download/8.10/I.Ming-8.10.ttf',
    'cba13b75b050d671b611d0063147262e421e14359ad4530948b070f56111f0f3'],
  '11_NotoSerifCJKhk.zip': ['https://github.com/notofonts/noto-cjk/releases/download/Serif2.003/11_NotoSerifCJKhk.zip',
    '2eaf73871cbc53e72bb1021d760eb64b395955d33fdc560964e15b429a64c288'],
}
const NOTO = ['OTF/TraditionalChineseHK/NotoSerifCJKhk-Regular.otf', 'e687d5674d83acf62d1264da5d002c5401363418abb98dca0836d38d88953708']

const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] })

function fresh(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function download(name) {
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
  for (const f of ['app.py', 'glyphs.txt']) fs.copyFileSync(path.join(root, 'py', f), path.join(stage, f))
  fs.writeFileSync(path.join(stage, 'versions.json'), JSON.stringify({ xjyutping_tex: texVersion() }))
  const zip = path.join(root, 'public', 'py.zip')
  fs.rmSync(zip, { force: true })
  // stored, not deflated, so that Tauri's brotli compresses the tables better
  run(TAR, ['-a', '--options', 'zip:compression=store', '-cf', zip, '-C', stage, '.'])
}

async function texbundle() {
  const out = fresh(path.join(root, 'src-tauri', 'resources', 'texbundle'))
  const tl = path.join(root, 'tex', 'tl2024')
  if (fs.existsSync(tl)) for (const f of fs.readdirSync(tl)) fs.copyFileSync(path.join(tl, f), path.join(out, f))
  else console.warn('vendor: tex/tl2024/ is missing; run scripts/harvest_bundle.py')
  for (const f of ['xjyutping.sty', 'xjyutping-chars.def', 'xjyutping-words.def']) {
    fs.copyFileSync(path.join(TEX, f), path.join(out, f))
  }
  fs.copyFileSync(await download('I.Ming-8.10.ttf'), path.join(out, 'I.Ming-8.10.ttf'))
  const noto = path.join(CACHE, path.basename(NOTO[0]))
  if (!fs.existsSync(noto) || sha256(noto) !== NOTO[1]) {
    run(TAR, ['-xf', await download('11_NotoSerifCJKhk.zip'), '-C', CACHE, '--strip-components', '2', NOTO[0]])
    if (sha256(noto) !== NOTO[1]) throw new Error(`${noto}: sha256 mismatch`)
  }
  fs.copyFileSync(noto, path.join(out, path.basename(noto)))
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
