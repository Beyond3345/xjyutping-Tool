// xjyutping-Tool UI: the lesson lives here, readings come from py/app.py under
// Pyodide, files and the PDF go through the Rust commands in src-tauri/src/lib.rs.
import { loadPyodide } from 'pyodide'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { resolveResource } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import { load } from '@tauri-apps/plugin-store'

type Kind = 'char' | 'word' | 'sentence'
type Item = { c: string; a: string | null; r: string | null; type: string | null; seg: number | null
  src: 'auto' | 'word' | 'spot' | null; cjk: boolean; key: string | null; at: number | null; glyph: boolean }
type Row = { line: string; items: Item[]; segs: number[][]; cjk: boolean; auto: Kind | null
  kind: Kind | null; duplicate: boolean }
type Lesson = { format: 1; title: string; author: string; date: string; audience: 'en' | 'zh' | 'yue'
  toneChart: boolean; text: string; words: Record<string, string>; spots: Record<string, Record<string, string>>
  kinds: Record<string, Kind> }
type KV = { get<T>(k: string): Promise<T | undefined>; set(k: string, v: unknown): Promise<void>
  delete(k: string): Promise<boolean>; entries<T>(): Promise<[string, T][]> }

const TAURI = '__TAURI_INTERNALS__' in window
const KIND_LABEL: Record<Kind, string> = { char: 'Character', word: 'Word', sentence: 'Sentence' }
const KIND_ORDER: (Kind | undefined)[] = [undefined, 'char', 'word', 'sentence']

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const input = $<HTMLTextAreaElement>('input')
const output = $('output')
const pop = $('popover')

let py: any = null
let settings: KV
let db: KV
let versions: Record<string, string> = {}
let lesson: Lesson
let rows: Row[] = []
let path: string | null = null
let dirty = false
let exporting = false
let size = 28

// --- start -----------------------------------------------------------------

function blank(): Lesson {
  // a new lesson keeps the author, the students' language and the tone chart choice
  return { format: 1, title: '', author: lesson?.author ?? '', date: '', audience: lesson?.audience ?? 'en',
    toneChart: lesson?.toneChart ?? false, text: '', words: {}, spots: {}, kinds: {} }
}

// the store plugin in the app, localStorage when the UI runs in a plain browser
async function kv(name: string): Promise<KV> {
  if (TAURI) return (await load(name, { autoSave: 300 })) as unknown as KV
  const key = (k: string) => `${name}:${k}`
  return {
    async get(k) { const v = localStorage.getItem(key(k)); return v === null ? undefined : JSON.parse(v) },
    async set(k, v) { localStorage.setItem(key(k), JSON.stringify(v)) },
    async delete(k) { const had = localStorage.getItem(key(k)) !== null; localStorage.removeItem(key(k)); return had },
    async entries<T>() {
      return Object.keys(localStorage).filter(k => k.startsWith(`${name}:`))
        .map(k => [k.slice(name.length + 1), JSON.parse(localStorage.getItem(k)!)] as [string, T])
    },
  }
}

async function startPython() {
  const timeout = new Promise<never>((_, fail) => setTimeout(() => fail(new Error('timed out after 30 s')), 30000))
  const pyodide = await Promise.race([loadPyodide({ indexURL: '/pyodide/' }), timeout])
  pyodide.unpackArchive(await (await fetch('/py.zip')).arrayBuffer(), 'zip')
  py = pyodide.pyimport('app')
  versions = { ...JSON.parse(py.versions()), app: TAURI ? await getVersion() : 'browser' }
}

async function loadFonts() {
  if (!TAURI) return
  for (const [family, file] of [['IMing', 'I.Ming-8.10.ttf'], ['NotoSerifHK', 'NotoSerifCJKhk-Regular.otf']]) {
    try {
      const face = new FontFace(family, `url("${convertFileSrc(await resolveResource(`texbundle/${file}`))}")`)
      document.fonts.add(await face.load())
    } catch { /* the system fonts in style.css are used instead */ }
  }
}

async function init() {
  settings = await kv('settings.json')
  db = await kv('corrections.json')
  lesson = { ...blank(), ...((await settings.get<Lesson>('draft')) ?? {}) }
  path = (await settings.get<string>('path')) ?? null
  dirty = (await settings.get<boolean>('dirty')) ?? false
  size = setSize((await settings.get<number>('size')) ?? 28)
  fillFields()
  updateTitle()
  loadFonts()
  const testing = TAURI && await invoke<boolean>('self_test')
  const start = performance.now()
  try {
    await startPython()
  } catch (e) {
    if (testing) return void invoke('self_test_done', { report: `python failed: ${e}`, tex: null })
    return status(`The dictionary could not be loaded (${e}). The app needs macOS 13.3 or later, `
      + 'or an up-to-date Microsoft Edge WebView2 on Windows.', true)
  }
  status('')
  // text typed while Python was loading is taken in now
  if (input.value !== lesson.text) textChanged()
  else render()
  if (testing) selfTest(performance.now() - start)
}

// run with --self-test <file>: read a sample with a word and a spot correction,
// then let the app compile it and write the report (src-tauri/src/lib.rs)
function selfTest(loadMs: number) {
  const sample: Lesson = { ...blank(), title: 'self-test', toneChart: true, text: '銀行\n佢𠮶度好多人。\n我哋去銀行。',
    words: { 銀行: 'ngan4 haang4' }, spots: { '佢𠮶度好多人。': { 1: 'go2' } } }
  const report = [`app ${versions.app}, xjyutping-py ${versions.xjyutping_py}, xjyutping-tex ${versions.xjyutping_tex}`,
    `python loaded in ${Math.round(loadMs)} ms`]
  try {
    const got: Row[] = JSON.parse(py.render(JSON.stringify(sample)))
    for (const row of got) report.push(`${row.line}: ${row.items.filter(i => i.cjk).map(i => i.r).join(' ')} (${row.kind})`)
    invoke('self_test_done', { report: report.join('\n'), tex: py.make_tex(JSON.stringify(sample)) })
  } catch (e) {
    invoke('self_test_done', { report: [...report, `failed: ${e}`].join('\n'), tex: null })
  }
}

// --- lesson fields ----------------------------------------------------------

function fillFields() {
  $<HTMLInputElement>('title').value = lesson.title
  $<HTMLInputElement>('author').value = lesson.author
  $<HTMLInputElement>('date').value = lesson.date
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name=audience]')) r.checked = r.value === lesson.audience
  $<HTMLInputElement>('toneChart').checked = lesson.toneChart
  input.value = lesson.text
}

for (const field of ['title', 'author', 'date'] as const) {
  $<HTMLInputElement>(field).addEventListener('input', e => {
    lesson[field] = (e.target as HTMLInputElement).value
    changed()
  })
}
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=audience]')) {
  r.addEventListener('change', () => { lesson.audience = r.value as Lesson['audience']; changed() })
}
$<HTMLInputElement>('toneChart').addEventListener('change', e => {
  lesson.toneChart = (e.target as HTMLInputElement).checked
  changed()
})

let draftTimer = 0
function changed() {
  dirty = true
  updateTitle()
  clearTimeout(draftTimer)
  draftTimer = window.setTimeout(saveDraft, 400)
}

function saveDraft() {
  settings.set('draft', lesson)
  settings.set('path', path)
  settings.set('dirty', dirty)
}

function updateTitle() {
  const name = path ? path.split(/[\\/]/).pop()! : (lesson?.title || 'Untitled lesson')
  const title = `${name}${dirty ? ' •' : ''} — xjyutping-Tool`
  if (TAURI) getCurrentWindow().setTitle(title)
  else document.title = title
}

function status(text: string, error = false) {
  const s = $('status')
  s.textContent = text
  s.classList.toggle('error', error)
}

// --- typing -----------------------------------------------------------------

input.addEventListener('input', e => { if (!(e as InputEvent).isComposing) textChanged() })
input.addEventListener('compositionend', textChanged)
input.addEventListener('keyup', followCaret)
input.addEventListener('click', followCaret)

function textChanged() {
  if (!py || input.value === lesson.text) return
  const old = lesson.text
  lesson.text = input.value
  const res = JSON.parse(py.migrate(JSON.stringify(lesson), old))
  lesson = res.lesson
  for (const [a, i, b, j] of res.moves as [string, number, string, number][]) moveRecord(a, i, b, j)
  if (res.lost) status(`${res.lost} correction(s) sat in the edited part of the line and were dropped.`)
  render()
  changed()
  followCaret()
}

async function moveRecord(a: string, i: number, b: string, j: number) {
  const rec = await db.get<Record<string, unknown>>(`c|${a}|${i}`)
  if (!rec) return
  await db.delete(`c|${a}|${i}`)
  await db.set(`c|${b}|${j}`, { ...rec, line: b, index: j })
}

function followCaret() {
  const n = input.value.slice(0, input.selectionStart).split('\n').length - 1
  output.querySelector(`.row[data-row="${n}"]`)?.scrollIntoView({ block: 'nearest' })
}

// --- rendering --------------------------------------------------------------

function el(tag: string, cls = '', text = '') {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

const contiguous = (ps: number[]) => ps.every((p, k) => k === 0 || p === ps[k - 1] + 1)
const occurrence = (it: Item) => Array.from({ length: [...it.key!].length }, (_, k) => it.at! + k)

function render() {
  if (!py) return
  rows = JSON.parse(py.render(JSON.stringify(lesson)))
  output.replaceChildren(...rows.map(drawRow))
  updateButtons()
}

// positions drawn as one group: a word correction's occurrence or a dictionary word
function groupAt(row: Row, i: number): number[] | null {
  const it = row.items[i]
  if (it.src === 'word' && it.key && it.at === i) return occurrence(it)
  const seg = it.seg !== null ? row.segs[it.seg] : null
  return seg && seg.length > 1 && seg[0] === i && contiguous(seg) ? seg : null
}

function drawRow(row: Row, r: number) {
  const div = el('div', 'row')
  div.dataset.row = String(r)
  if (!row.line) div.hidden = true
  const text = el('div', 'text')
  div.append(text)
  if (!row.cjk) {
    div.classList.add('plain')
    text.textContent = row.line
    return div
  }
  for (let i = 0; i < row.items.length;) {
    const group = groupAt(row, i)
    if (group) {
      const span = el('span', 'seg')
      if (group.every(p => row.items[p].src === 'word')) span.classList.add('word')
      for (const p of group) span.append(drawChar(row, r, p))
      text.append(span)
      i = group[group.length - 1] + 1
    } else {
      const it = row.items[i]
      text.append(it.cjk ? drawChar(row, r, i) : document.createTextNode(it.c))
      i++
    }
  }
  if (row.duplicate) div.append(el('span', 'dup', 'printed once'))
  const tag = el('button', 'tag', KIND_LABEL[row.kind!])
  tag.dataset.row = String(r)
  tag.title = 'Section of the PDF; click to change (automatic → Character → Word → Sentence)'
  if (lesson.kinds[row.line]) tag.classList.add('chosen')
  div.append(tag)
  return div
}

function drawChar(row: Row, r: number, i: number) {
  const it = row.items[i]
  const ruby = el('ruby')
  ruby.dataset.row = String(r)
  ruby.dataset.i = String(i)
  ruby.append(it.c, el('rt', '', it.r ?? '?'))
  if (!it.r) ruby.classList.add('missing')
  else if (it.src === 'word' || it.src === 'spot') ruby.classList.add(it.src)
  else if (it.type === 'm') ruby.classList.add('guess')
  if (!it.glyph) {
    ruby.classList.add('noglyph')
    ruby.title = 'Neither font of the PDF has this character, so it would print as a blank'
  }
  return ruby
}

function missingReadings() {
  const found: [number, number][] = []
  rows.forEach((row, r) => {
    if (row.cjk && !row.duplicate) row.items.forEach((it, i) => { if (it.cjk && !it.r) found.push([r, i]) })
  })
  return found
}

function correctionCount() {
  return Object.keys(lesson.words).length
    + Object.values(lesson.spots).reduce((n, marks) => n + Object.keys(marks).length, 0)
}

function updateButtons() {
  const gen = $<HTMLButtonElement>('generate')
  const missing = missingReadings().length
  gen.disabled = !py || exporting
  gen.textContent = missing ? `Generate PDF (${missing} need a reading)` : 'Generate PDF'
  $('corrections').textContent = `Corrections (${correctionCount()})`
}

output.addEventListener('click', e => {
  const t = e.target as HTMLElement
  const tag = t.closest<HTMLElement>('.tag')
  if (tag) return cycleKind(Number(tag.dataset.row))
  const ruby = t.closest<HTMLElement>('ruby')
  if (ruby) openEditor(Number(ruby.dataset.row), Number(ruby.dataset.i), ruby)
})

function cycleKind(r: number) {
  const line = rows[r].line
  const next = KIND_ORDER[(KIND_ORDER.indexOf(lesson.kinds[line]) + 1) % KIND_ORDER.length]
  if (next) lesson.kinds[line] = next
  else delete lesson.kinds[line]
  render()
  changed()
}

// --- the correction popover -------------------------------------------------

type Target = { r: number; span: number[]; active: number; force: boolean; anchor: HTMLElement
  vals: Record<number, string> }
let target: Target | null = null

function unitAt(row: Row, p: number) {
  const it = row.items[p]
  const seg = it.seg !== null ? row.segs[it.seg] : null
  return seg && seg.length > 1 && contiguous(seg) ? seg : [p]
}

function initialSpan(row: Row, i: number) {
  const it = row.items[i]
  if (it.src === 'word' && it.key && it.at !== null) return occurrence(it)
  const unit = unitAt(row, i)
  if (unit.length > 1) return unit
  if (row.kind === 'word') {
    const cjk = row.items.flatMap((x, p) => (x.cjk ? [p] : []))
    if (cjk.length > 1 && contiguous(cjk)) return cjk
  }
  return [i]
}

function widen(side: -1 | 1, apply = true) {
  if (!target) return false
  const row = rows[target.r]
  const p = side < 0 ? target.span[0] - 1 : target.span[target.span.length - 1] + 1
  if (p < 0 || p >= row.items.length || !row.items[p].cjk) return false
  if (apply) {
    const unit = unitAt(row, p)
    target.span = side < 0 ? [...unit, ...target.span] : [...target.span, ...unit]
    drawEditor()
  }
  return true
}

function openEditor(r: number, i: number, anchor: HTMLElement) {
  target = { r, span: initialSpan(rows[r], i), active: i, force: false, anchor, vals: {} }
  drawEditor()
}

function closeEditor() {
  pop.hidden = true
  target = null
}

function spanKey(row: Row, span: number[]) {
  return span.map(p => row.items[p].c).join('')
}

function hasCorrection(row: Row, span: number[]) {
  return span.length > 1 ? spanKey(row, span) in lesson.words : String(span[0]) in (lesson.spots[row.line] ?? {})
}

function drawEditor() {
  if (!target) return
  const t = target
  const row = rows[t.r]
  const word = t.span.length > 1
  const key = spanKey(row, t.span)
  pop.replaceChildren()
  const places = rows.reduce((n, x) => n + (x.line.split(key).length - 1), 0)
  pop.append(el('div', 'scope', word
    ? `Changes ${key} in this lesson wherever it is read as a word (up to ${places} place${places === 1 ? '' : 's'})`
    : 'Only this character, here'))
  const fields = el('div', 'fields')
  const inputs: HTMLInputElement[] = []
  for (const p of t.span) {
    const f = el('label', `field${p === t.active ? ' active' : ''}`)
    const box = document.createElement('input')
    box.value = t.vals[p] ?? row.items[p].r ?? ''
    box.spellcheck = false
    box.addEventListener('input', () => { t.vals[p] = box.value })
    box.addEventListener('focus', () => { if (t.active !== p) { t.active = p; drawEditor() } })
    // Esc is handled by the document listener, so that it does not also leave Present
    box.addEventListener('keydown', e => { if (e.key === 'Enter') save(inputs) })
    f.append(el('span', '', row.items[p].c), box)
    fields.append(f)
    inputs.push(box)
  }
  pop.append(fields)
  const chips = el('div', 'chips')
  const cand = JSON.parse(py.candidates(JSON.stringify(lesson), t.r, t.active))
  for (const s of cand.all as string[]) {
    const b = el('button', cand.given.includes(s) ? 'given' : '', s)
    b.title = s === cand.auto ? "xjyutping's reading" : cand.given.includes(s) ? 'Already used in this lesson' : ''
    if (s === cand.auto) b.textContent = `${s} ·auto`
    b.addEventListener('click', () => {
      inputs[t.span.indexOf(t.active)].value = t.vals[t.active] = s
      if (!word) save(inputs)
    })
    chips.append(b)
  }
  pop.append(chips)
  const note = el('div', 'note')
  pop.append(note)
  const actions = el('div', 'actions')
  const left = el('span'), right = el('span')
  const grow = (label: string, side: -1 | 1, tip: string) => {
    const b = el('button', '', label) as HTMLButtonElement
    b.title = tip
    b.disabled = !widen(side, false)
    b.addEventListener('click', () => widen(side))
    return b
  }
  left.append(grow('◀ +', -1, 'Add the character before, to correct them as one word'),
    grow('+ ▶', 1, 'Add the character after, to correct them as one word'))
  const reset = el('button', '', 'Reset') as HTMLButtonElement
  reset.disabled = !hasCorrection(row, t.span)
  reset.addEventListener('click', () => apply(row, t.span, null))
  const cancel = el('button', '', 'Cancel')
  cancel.addEventListener('click', closeEditor)
  const ok = el('button', 'primary', 'Save')
  ok.addEventListener('click', () => save(inputs))
  right.append(reset, cancel, ok)
  actions.append(left, right)
  pop.append(actions)
  pop.hidden = false
  place(t.anchor)
  const focus = inputs[Math.max(0, t.span.indexOf(t.active))]
  focus.focus()
  focus.select()

  function save(boxes: HTMLInputElement[]) {
    const vals = boxes.map(b => JSON.parse(py.check(b.value)))
    const bad = vals.find(v => !v.valid)
    if (bad) return void (note.textContent = `"${bad.value}" is not a Jyutping syllable (letters, then a tone 1–6).`)
    const unknown = vals.filter(v => !v.known).map(v => v.value)
    if (unknown.length && !t.force) {
      t.force = true
      return void (note.textContent = `${unknown.join(', ')} is not a syllable xjyutping knows. Save again to use it.`)
    }
    apply(row, t.span, vals.map(v => v.value))
  }
}

function place(anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect()
  const w = pop.offsetWidth, h = pop.offsetHeight
  pop.style.left = `${Math.max(8, Math.min(a.left, innerWidth - w - 8))}px`
  pop.style.top = `${a.bottom + 6 + h > innerHeight ? Math.max(8, a.top - h - 6) : a.bottom + 6}px`
}

// save (syls) or reset (null) the correction of a span, in the lesson and the database
function apply(row: Row, span: number[], syls: string[] | null) {
  const autos = span.map(p => row.items[p].a)
  const same = syls !== null && syls.join(' ') === autos.join(' ')
  const before = rows
  if (span.length > 1) {
    const key = spanKey(row, span)
    const marks = lesson.spots[row.line]
    if (marks) for (const p of span) delete marks[String(p)]
    if (syls === null || same) {
      delete lesson.words[key]
      db.delete(`w|${key}`)
    } else {
      lesson.words[key] = syls.join(' ')
      db.set(`w|${key}`, { kind: 'word', text: key, readings: syls.join(' '), auto: autos.join(' '),
        first_line: row.line, time: new Date().toISOString(), ...versions })
    }
  } else {
    const p = span[0]
    const marks = (lesson.spots[row.line] ??= {})
    if (syls === null || same) {
      delete marks[String(p)]
      db.delete(`c|${row.line}|${p}`)
    } else {
      marks[String(p)] = syls[0]
      db.set(`c|${row.line}|${p}`, { kind: 'char', char: row.items[p].c, line: row.line, index: p,
        auto: autos[0], corrected: syls[0], type: row.items[p].type, time: new Date().toISOString(), ...versions })
    }
    if (!Object.keys(marks).length) delete lesson.spots[row.line]
  }
  const edited = target?.r
  closeEditor()
  render()
  changed()
  // briefly mark the other rows whose readings this changed
  rows.forEach((x, r) => {
    const old = before[r]
    if (r !== edited && old && old.line === x.line && old.items.some((it, i) => it.r !== x.items[i]?.r)) {
      output.querySelector(`.row[data-row="${r}"]`)?.classList.add('flash')
    }
  })
}

document.addEventListener('mousedown', e => {
  if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('ruby')) closeEditor()
})

// --- generate ---------------------------------------------------------------

$('generate').addEventListener('click', async () => {
  const missing = missingReadings()
  if (missing.length) {
    const [r, i] = missing[0]
    const ruby = output.querySelector<HTMLElement>(`ruby[data-row="${r}"][data-i="${i}"]`)!
    ruby.scrollIntoView({ block: 'center' })
    status(`${missing.length} character(s) have no reading yet; click each red ? to give one.`, true)
    return openEditor(r, i, ruby)
  }
  if (!TAURI) return status('Generate needs the installed app.', true)
  exporting = true
  updateButtons()
  status('Generating… (the first time also prepares the TeX engine, which takes longer)')
  try {
    const tex: string = py.make_tex(JSON.stringify(lesson))
    const res = await invoke<{ path: string | null; missing: string[] }>('export_pdf',
      { tex, name: lesson.title || 'lesson' })
    if (!res.path) status('The PDF was not saved.')
    else status(`Saved ${res.path}` + (res.missing.length
      ? `. No glyph in the fonts, printed blank: ${res.missing.join(' ')}` : ''))
  } catch (e) {
    status(String(e).trim().split('\n').pop()!, true)
  } finally {
    exporting = false
    updateButtons()
  }
})

// --- lesson files -----------------------------------------------------------

function prune() {
  const lines = new Set(rows.map(r => r.line))
  for (const k of Object.keys(lesson.spots)) if (!lines.has(k)) delete lesson.spots[k]
  for (const k of Object.keys(lesson.kinds)) if (!lines.has(k)) delete lesson.kinds[k]
}

async function saveLesson(saveAs: boolean) {
  // without Python the rows are unknown, and prune() would drop every spot
  if (!TAURI || !py) return false
  prune()
  let saved: string | null
  try {
    saved = await invoke<string | null>('save_lesson',
      { contents: JSON.stringify(lesson, null, 1), name: lesson.title || 'lesson', path: saveAs ? null : path })
  } catch (e) {
    status(`The lesson could not be saved: ${e}`, true)
    return false
  }
  if (!saved) return false
  path = saved
  dirty = false
  updateTitle()
  saveDraft()
  status(`Saved ${saved}`)
  return true
}

async function mayDiscard() {
  if (!dirty || !TAURI) return true
  const res = await message('This lesson has changes that are not saved in a lesson file.',
    { title: 'xjyutping-Tool', kind: 'warning', buttons: { yes: 'Save', no: 'Discard', cancel: 'Cancel' } })
  if (res === 'Save') return saveLesson(false)
  return res === 'Discard'
}

function replaceLesson(next: Lesson, nextPath: string | null) {
  lesson = next
  path = nextPath
  dirty = false
  closeEditor()
  fillFields()
  render()
  updateTitle()
  saveDraft()
}

$('new').addEventListener('click', async () => {
  if (await mayDiscard()) replaceLesson(blank(), null)
})

$('open').addEventListener('click', async () => {
  if (!TAURI || !py || !(await mayDiscard())) return
  let file: [string, string] | null
  try {
    file = await invoke<[string, string] | null>('open_lesson')
  } catch (e) {
    return status(`The file could not be read: ${e}`, true)
  }
  if (!file) return
  try {
    const res = JSON.parse(py.clean(file[1]))
    replaceLesson({ ...blank(), ...res.lesson, format: 1 }, file[0])
    status(res.dropped.length ? `Opened; dropped invalid corrections: ${res.dropped.join(', ')}` : `Opened ${file[0]}`)
  } catch {
    status('This file is not an xjyutping-Tool lesson.', true)
  }
})

$('save').addEventListener('click', () => saveLesson(false))
$('saveas').addEventListener('click', () => saveLesson(true))

// --- corrections list and export --------------------------------------------

$('corrections').addEventListener('click', async () => {
  const dlg = $<HTMLDialogElement>('list')
  dlg.replaceChildren(el('h3', '', 'Corrections in this lesson'))
  const table = el('table')
  const add = (what: string, value: string, reset: () => Promise<void>) => {
    const tr = el('tr')
    const b = el('button', '', 'Reset')
    b.addEventListener('click', async () => { await reset(); render(); changed(); tr.remove(); count() })
    const td = el('td')
    td.append(b)
    tr.append(el('td', '', what), el('td', '', value), td)
    table.append(tr)
  }
  for (const [key, value] of Object.entries(lesson.words)) {
    add(`${key} (word)`, value, async () => { delete lesson.words[key]; await db.delete(`w|${key}`) })
  }
  for (const [line, marks] of Object.entries(lesson.spots)) {
    for (const [i, value] of Object.entries(marks)) {
      add(`${[...line][Number(i)] ?? '?'} in ${line}`, value, async () => {
        delete marks[i]
        if (!Object.keys(marks).length) delete lesson.spots[line]
        await db.delete(`c|${line}|${i}`)
      })
    }
  }
  if (!table.childElementCount) dlg.append(el('p', '', 'No corrections yet. Click a character to correct it.'))
  else dlg.append(table)
  const exp = el('button', 'primary') as HTMLButtonElement
  const count = async () => {
    const n = (await db.entries()).length
    exp.textContent = `Export all corrections (${n})…`
    exp.disabled = !n || !TAURI
  }
  await count()
  exp.addEventListener('click', async () => {
    const records = await db.entries<Record<string, unknown>>()
    const day = new Date().toISOString().slice(0, 10)
    const contents = JSON.stringify({ exported: new Date().toISOString(), ...versions,
      records: records.map(([, v]) => v) }, null, 1)
    try {
      const saved = await invoke<string | null>('export_corrections', { contents, name: `xjyutping-corrections-${day}.json` })
      if (saved) status(`Saved ${records.length} corrections to ${saved}; please send this file to the maintainer.`)
    } catch (e) {
      status(`The corrections could not be saved: ${e}`, true)
    }
    dlg.close()
  })
  const close = el('button', '', 'Close')
  close.addEventListener('click', () => dlg.close())
  const bar = el('div', 'actions')
  bar.append(exp, close)
  dlg.append(bar)
  dlg.showModal()
})

// --- view -------------------------------------------------------------------

function setSize(px: number) {
  const size = Math.max(16, Math.min(72, px))
  document.documentElement.style.setProperty('--size', `${size}px`)
  settings?.set('size', size)
  return size
}
$('smaller').addEventListener('click', () => { size = setSize(size - 4) })
$('bigger').addEventListener('click', () => { size = setSize(size + 4) })

async function present(on: boolean) {
  document.body.classList.toggle('present', on)
  if (TAURI) await getCurrentWindow().setFullscreen(on)
}
$('present').addEventListener('click', () => present(true))

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!pop.hidden) closeEditor()
    else if (document.body.classList.contains('present')) present(false)
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveLesson(e.shiftKey)
  }
})

init()
