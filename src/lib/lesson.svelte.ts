// The state of the window: the lesson, its file, the readings derived from it
// by py/app.py, the correction editor, and the actions the components call.
// The rules of the corrections live in py/app.py; this module only applies
// what the teacher chose and keeps the corrections database in step.
import { tick } from 'svelte'
import { python, startPython } from './python'
import { TAURI, kv, appVersion, commands, askSaveDiscard, setFullscreen, loadFonts, type KV } from './platform'
import type { Item, Kind, Lesson, Row } from './types'

export const KIND_LABEL: Record<Kind, string> = { char: 'Character', word: 'Word', sentence: 'Sentence' }
const KIND_ORDER: (Kind | undefined)[] = [undefined, 'char', 'word', 'sentence']

// --- positions within a row ---------------------------------------------------

export const contiguous = (ps: number[]) => ps.every((p, k) => k === 0 || p === ps[k - 1] + 1)

/** the positions of the word correction that covers this item */
export const occurrence = (it: Item) => Array.from({ length: [...it.key!].length }, (_, k) => it.at! + k)

/** positions drawn as one group: a word correction's occurrence or a dictionary word */
export function groupAt(row: Row, i: number): number[] | null {
  const it = row.items[i]
  if (it.src === 'word' && it.key && it.at === i) return occurrence(it)
  const seg = it.seg !== null ? row.segs[it.seg] : null
  return seg && seg.length > 1 && seg[0] === i && contiguous(seg) ? seg : null
}

/** the word around a position, or the position alone */
function unitAt(row: Row, p: number) {
  const it = row.items[p]
  const seg = it.seg !== null ? row.segs[it.seg] : null
  return seg && seg.length > 1 && contiguous(seg) ? seg : [p]
}

/** what a click on a character corrects: its word, the whole Word row, or itself */
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

export const spanKey = (row: Row, span: number[]) => span.map(p => row.items[p].c).join('')

// --- state ------------------------------------------------------------------

export type Editor = {
  r: number
  span: number[]
  active: number
  force: boolean // the next Save accepts syllables xjyutping does not know
  vals: Record<number, string> // what was typed, kept when the editor redraws
  note: string
  anchor: DOMRect
}

/** a new lesson keeps the author, the students' language and the tone chart choice */
function blank(prev: Lesson | null): Lesson {
  return { format: 1, title: '', author: prev?.author ?? '', date: '', audience: prev?.audience ?? 'en',
    toneChart: prev?.toneChart ?? false, text: '', words: {}, spots: {}, kinds: {} }
}

const clampSize = (px: number) => Math.max(16, Math.min(72, px))

class Store {
  lesson = $state<Lesson>(blank(null))
  path = $state<string | null>(null)
  dirty = $state(false)
  size = $state(28)
  ready = $state(false)
  loadError = $state<string | null>(null)
  exporting = $state(false)
  present = $state(false)
  editor = $state<Editor | null>(null)
  dialog = $state(false)
  toast = $state<{ text: string; error: boolean } | null>(null)
  flash = $state<number[]>([])

  /** the rows depend only on the text and the corrections, not on the title or the audience */
  rows: Row[] = $derived.by(() => (this.ready ? python.render(this.readingInput()) : []))

  /** characters without a reading, which keep the PDF from being made */
  missing: [number, number][] = $derived.by(() =>
    this.rows.flatMap((row, r) => (row.cjk && !row.duplicate
      ? row.items.flatMap((it, i) => (it.cjk && !it.r ? [[r, i] as [number, number]] : []))
      : [])))

  correctionCount = $derived(Object.keys(this.lesson.words).length
    + Object.values(this.lesson.spots).reduce((n, marks) => n + Object.keys(marks).length, 0))

  /** the parts of the lesson that py/app.py reads to render (and to offer candidates) */
  readingInput(): Lesson {
    const { text, words, spots, kinds } = this.lesson
    return $state.snapshot({ text, words, spots, kinds }) as Lesson
  }

  #settings!: KV
  #db!: KV
  #versions: Record<string, string> = {}
  #pending: string | null = null
  #draftTimer = 0
  #toastTimer = 0
  #opener: [number, number] | null = null

  async init() {
    this.#settings = await kv('settings.json')
    this.#db = await kv('corrections.json')
    this.lesson = { ...blank(null), ...((await this.#settings.get<Lesson>('draft')) ?? {}) }
    this.path = (await this.#settings.get<string>('path')) ?? null
    this.dirty = (await this.#settings.get<boolean>('dirty')) ?? false
    this.size = clampSize((await this.#settings.get<number>('size')) ?? 28)
    loadFonts()
    const testing = await commands.selfTest()
    const start = performance.now()
    try {
      await startPython()
      this.#versions = { ...python.versions(), app: await appVersion() }
    } catch (e) {
      if (testing) return void commands.selfTestDone(`python failed: ${e}`, null)
      this.loadError = String(e)
      return
    }
    this.ready = true
    // text typed while Python was loading is taken in now
    if (this.#pending !== null && this.#pending !== this.lesson.text) this.textChanged(this.#pending)
    if (testing) this.#selfTest(performance.now() - start)
  }

  // run with --self-test <file>: read a sample with a word and a spot correction,
  // then let the app compile it and write the report (src-tauri/src/main.rs)
  #selfTest(loadMs: number) {
    const sample: Lesson = { ...blank(null), title: 'self-test', toneChart: true, text: '銀行\n佢𠮶度好多人。\n我哋去銀行。',
      words: { 銀行: 'ngan4 haang4' }, spots: { '佢𠮶度好多人。': { 1: 'go2' } } }
    const v = this.#versions
    const report = [`app ${v.app}, xjyutping-py ${v.xjyutping_py}, xjyutping-tex ${v.xjyutping_tex}`,
      `python loaded in ${Math.round(loadMs)} ms`]
    try {
      for (const row of python.render(sample)) {
        report.push(`${row.line}: ${row.items.filter(i => i.cjk).map(i => i.r).join(' ')} (${row.kind})`)
      }
      commands.selfTestDone(report.join('\n'), python.makeTex(sample))
    } catch (e) {
      commands.selfTestDone([...report, `failed: ${e}`].join('\n'), null)
    }
  }

  // --- messages and saving the draft -------------------------------------------

  /** a notice at the bottom; errors and those reporting a loss (sticky) stay until dismissed */
  notify(text: string, error = false, sticky = false) {
    clearTimeout(this.#toastTimer)
    this.toast = text ? { text, error } : null
    if (text && !error && !sticky) this.#toastTimer = window.setTimeout(() => (this.toast = null), 6000)
  }

  changed() {
    this.dirty = true
    clearTimeout(this.#draftTimer)
    this.#draftTimer = window.setTimeout(() => this.#saveDraft(), 400)
  }

  #saveDraft() {
    this.#settings.set('draft', $state.snapshot(this.lesson))
    this.#settings.set('path', this.path)
    this.#settings.set('dirty', this.dirty)
  }

  set<K extends 'title' | 'author' | 'date' | 'audience' | 'toneChart'>(field: K, value: Lesson[K]) {
    this.lesson[field] = value
    this.changed()
  }

  setSize(px: number) {
    this.size = clampSize(px)
    this.#settings.set('size', this.size)
  }

  async setPresent(on: boolean) {
    this.present = on
    if (!on) this.editor = null
    await setFullscreen(on)
  }

  // --- typing -------------------------------------------------------------------

  textChanged(value: string) {
    if (!this.ready) return void (this.#pending = value)
    if (value === this.lesson.text) return
    // the editor's positions belong to the text as it was
    this.editor = null
    const old = this.lesson.text
    const res = python.migrate({ ...($state.snapshot(this.lesson) as Lesson), text: value }, old)
    this.lesson = res.lesson
    for (const [a, i, b, j] of res.moves) this.#moveRecord(a, i, b, j)
    if (res.lost) this.notify(`${res.lost} correction(s) sat in the edited part of the line and were dropped.`, false, true)
    this.changed()
  }

  /** a character correction follows its line when the line is edited */
  async #moveRecord(a: string, i: number, b: string, j: number) {
    const rec = await this.#db.get<Record<string, unknown>>(`c|${a}|${i}`)
    if (!rec) return
    await this.#db.delete(`c|${a}|${i}`)
    await this.#db.set(`c|${b}|${j}`, { ...rec, line: b, index: j })
  }

  cycleKind(r: number) {
    const line = this.rows[r].line
    const next = KIND_ORDER[(KIND_ORDER.indexOf(this.lesson.kinds[line]) + 1) % KIND_ORDER.length]
    if (next) this.lesson.kinds[line] = next
    else delete this.lesson.kinds[line]
    this.changed()
  }

  // --- the correction editor ------------------------------------------------------

  openEditor(r: number, i: number, anchor: Element) {
    this.#opener = [r, i]
    this.editor = { r, span: initialSpan(this.rows[r], i), active: i, force: false, vals: {}, note: '',
      anchor: anchor.getBoundingClientRect() }
  }

  /** closes the editor; from the keyboard or its buttons, the focus goes back to the character */
  closeEditor(restoreFocus = true) {
    this.editor = null
    const opener = this.#opener
    if (!restoreFocus || !opener) return
    tick().then(() => document.querySelector<HTMLElement>(`.char[data-row="${opener[0]}"][data-i="${opener[1]}"]`)?.focus())
  }

  /** whether the editor's span can take the neighbouring character on one side */
  canWiden(side: -1 | 1) {
    const e = this.editor
    if (!e) return false
    const row = this.rows[e.r]
    const p = side < 0 ? e.span[0] - 1 : e.span[e.span.length - 1] + 1
    return p >= 0 && p < row.items.length && row.items[p].cjk
  }

  widen(side: -1 | 1) {
    const e = this.editor
    if (!e || !this.canWiden(side)) return
    const row = this.rows[e.r]
    const unit = unitAt(row, side < 0 ? e.span[0] - 1 : e.span[e.span.length - 1] + 1)
    e.span = side < 0 ? [...unit, ...e.span] : [...e.span, ...unit]
  }

  hasCorrection(r: number, span: number[]) {
    const row = this.rows[r]
    return span.length > 1 ? spanKey(row, span) in this.lesson.words
      : String(span[0]) in (this.lesson.spots[row.line] ?? {})
  }

  /** checks the typed syllables, then saves them; a syllable xjyutping does not know needs a second Save */
  saveEditor(boxes: string[]) {
    const e = this.editor
    if (!e) return
    const vals = boxes.map(b => python.check(b))
    const bad = vals.find(v => !v.valid)
    if (bad) return void (e.note = `"${bad.value}" is not a Jyutping syllable (letters, then a tone 1–6).`)
    const unknown = vals.filter(v => !v.known).map(v => v.value)
    if (unknown.length && !e.force) {
      e.force = true
      return void (e.note = `${unknown.join(', ')} is not a syllable xjyutping knows. Save again to use it.`)
    }
    this.apply(e.r, e.span, vals.map(v => v.value))
  }

  /** saves (syls) or resets (null) the correction of a span, in the lesson and the database */
  apply(r: number, span: number[], syls: string[] | null) {
    const row = this.rows[r]
    const autos = span.map(p => row.items[p].a)
    const same = syls !== null && syls.join(' ') === autos.join(' ')
    const before = this.rows
    const time = new Date().toISOString()
    if (span.length > 1) {
      const key = spanKey(row, span)
      const marks = this.lesson.spots[row.line]
      if (marks) for (const p of span) delete marks[String(p)]
      if (syls === null || same) {
        delete this.lesson.words[key]
        this.#db.delete(`w|${key}`)
      } else {
        this.lesson.words[key] = syls.join(' ')
        this.#db.set(`w|${key}`, { kind: 'word', text: key, readings: syls.join(' '), auto: autos.join(' '),
          first_line: row.line, time, ...this.#versions })
      }
    } else {
      const p = span[0]
      const marks = (this.lesson.spots[row.line] ??= {})
      if (syls === null || same) {
        delete marks[String(p)]
        this.#db.delete(`c|${row.line}|${p}`)
      } else {
        marks[String(p)] = syls[0]
        this.#db.set(`c|${row.line}|${p}`, { kind: 'char', char: row.items[p].c, line: row.line, index: p,
          auto: autos[0], corrected: syls[0], type: row.items[p].type, time, ...this.#versions })
      }
      if (!Object.keys(marks).length) delete this.lesson.spots[row.line]
    }
    this.closeEditor()
    this.changed()
    // briefly mark the other rows whose readings this changed
    this.flash = this.rows.flatMap((x, k) => {
      const old = before[k]
      return k !== r && old && old.line === x.line && old.items.some((it, i) => it.r !== x.items[i]?.r) ? [k] : []
    })
    setTimeout(() => (this.flash = []), 1400)
  }

  // --- the corrections dialog -------------------------------------------------------

  async resetWord(key: string) {
    delete this.lesson.words[key]
    await this.#db.delete(`w|${key}`)
    this.changed()
  }

  async resetSpot(line: string, i: string) {
    const marks = this.lesson.spots[line]
    if (!marks) return
    delete marks[i]
    if (!Object.keys(marks).length) delete this.lesson.spots[line]
    await this.#db.delete(`c|${line}|${i}`)
    this.changed()
  }

  recordCount = async () => (await this.#db.entries()).length

  async exportCorrections() {
    const records = await this.#db.entries<Record<string, unknown>>()
    const day = new Date().toISOString().slice(0, 10)
    const contents = JSON.stringify({ exported: new Date().toISOString(), ...this.#versions,
      records: records.map(([, v]) => v) }, null, 1)
    try {
      const saved = await commands.exportCorrections(contents, `xjyutping-corrections-${day}.json`)
      if (saved) this.notify(`Saved ${records.length} corrections to ${saved}; please send this file to the maintainer.`)
    } catch (e) {
      this.notify(`The corrections could not be saved: ${e}`, true)
    }
  }

  // --- the PDF ------------------------------------------------------------------------

  async generate() {
    if (this.missing.length) {
      const [r, i] = this.missing[0]
      const ruby = document.querySelector(`.char[data-row="${r}"][data-i="${i}"]`)
      ruby?.scrollIntoView({ block: 'center' })
      this.notify(`${this.missing.length} character(s) have no reading yet; click each red ? to give one.`, true)
      if (ruby) this.openEditor(r, i, ruby)
      return
    }
    if (!TAURI) return this.notify('Generate needs the installed app.', true)
    this.exporting = true
    this.notify('Generating… (the first time also prepares the TeX engine, which takes longer)')
    try {
      const res = await commands.exportPdf(python.makeTex($state.snapshot(this.lesson) as Lesson), this.lesson.title || 'lesson')
      if (!res.path) this.notify('The PDF was not saved.')
      else this.notify(`Saved ${res.path}` + (res.missing.length
        ? `. No glyph in the fonts, printed blank: ${res.missing.join(' ')}` : ''))
    } catch (e) {
      this.notify(String(e).trim().split('\n').pop()!, true)
    } finally {
      this.exporting = false
    }
  }

  // --- lesson files ---------------------------------------------------------------------

  /** drops the spots and kinds of lines that are gone */
  #prune() {
    const lines = new Set(this.rows.map(r => r.line))
    for (const k of Object.keys(this.lesson.spots)) if (!lines.has(k)) delete this.lesson.spots[k]
    for (const k of Object.keys(this.lesson.kinds)) if (!lines.has(k)) delete this.lesson.kinds[k]
  }

  async save(saveAs: boolean) {
    // without Python the rows are unknown, and pruning would drop every spot
    if (!TAURI || !this.ready) return false
    this.#prune()
    let saved: string | null
    try {
      saved = await commands.saveLesson(JSON.stringify($state.snapshot(this.lesson), null, 1),
        this.lesson.title || 'lesson', saveAs ? null : this.path)
    } catch (e) {
      this.notify(`The lesson could not be saved: ${e}`, true)
      return false
    }
    if (!saved) return false
    this.path = saved
    this.dirty = false
    this.#saveDraft()
    this.notify(`Saved ${saved}`)
    return true
  }

  async #mayDiscard() {
    if (!this.dirty || !TAURI) return true
    const answer = await askSaveDiscard()
    if (answer === 'Save') return this.save(false)
    return answer === 'Discard'
  }

  #replace(next: Lesson, path: string | null) {
    this.lesson = next
    this.path = path
    this.dirty = false
    this.editor = null
    // text typed while Python was loading belongs to the replaced lesson
    this.#pending = null
    this.#saveDraft()
  }

  async newLesson() {
    if (await this.#mayDiscard()) this.#replace(blank(this.lesson), null)
  }

  async open() {
    if (!TAURI || !this.ready || !(await this.#mayDiscard())) return
    let file: [string, string] | null
    try {
      file = await commands.openLesson()
    } catch (e) {
      return this.notify(`The file could not be read: ${e}`, true)
    }
    if (!file) return
    try {
      const res = python.clean(file[1])
      this.#replace({ ...blank(this.lesson), ...res.lesson, format: 1 }, file[0])
      if (res.dropped.length) this.notify(`Opened; dropped invalid corrections: ${res.dropped.join(', ')}`, false, true)
      else this.notify(`Opened ${file[0]}`)
    } catch {
      this.notify('This file is not an xjyutping-Tool lesson.', true)
    }
  }
}

export const store = new Store()
