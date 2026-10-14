// What the window needs from the app around it: storage, the Rust commands of
// src-tauri/src/main.rs, the window itself and the fonts of the PDF. In a plain
// browser (npx vite) the store falls back to localStorage and files are off.
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { resolveResource } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import { load } from '@tauri-apps/plugin-store'
import type { Font } from './types'

export const TAURI = '__TAURI_INTERNALS__' in window

export type KV = {
  get<T>(k: string): Promise<T | undefined>
  set(k: string, v: unknown): Promise<void>
  delete(k: string): Promise<boolean>
  entries<T>(): Promise<[string, T][]>
}

export async function kv(name: string): Promise<KV> {
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

export const appVersion = () => (TAURI ? getVersion() : Promise.resolve('browser'))

const fontRef = (f: Font) => ({ postscript: f.postscript, hint: f.hint, file: f.file })

export const commands = {
  /** fonts: the installed fonts the TeX source uses, copied next to it to compile */
  exportPdf: (tex: string, name: string, fonts: Font[]) =>
    invoke<{ path: string | null; missing: string[] }>('export_pdf', { tex, name, fonts: fonts.map(fontRef) }),
  openLesson: () => invoke<[string, string] | null>('open_lesson'),
  saveLesson: (contents: string, name: string, path: string | null) =>
    invoke<string | null>('save_lesson', { contents, name, path }),
  exportCorrections: (contents: string, name: string) =>
    invoke<string | null>('export_corrections', { contents, name }),
  selfTest: () => (TAURI ? invoke<boolean>('self_test') : Promise.resolve(false)),
  /** jobs: the TeX sources to compile, each with the installed fonts it uses; null when the test failed */
  selfTestDone: (report: string, jobs: { tex: string; fonts: Font[] }[] | null) =>
    invoke('self_test_done', { report, jobs: jobs?.map(j => ({ tex: j.tex, fonts: j.fonts.map(fontRef) })) ?? null }),
}

/** asks before replacing a lesson with unsaved changes */
export async function askSaveDiscard(): Promise<'Save' | 'Discard' | 'Cancel'> {
  const res = await message('This lesson has changes that are not saved in a lesson file.',
    { title: 'xjyutping-Tool', kind: 'warning', buttons: { yes: 'Save', no: 'Discard', cancel: 'Cancel' } })
  if (res === 'Save') return 'Save'
  if (res === 'Discard') return 'Discard'
  return 'Cancel'
}

/** asks before the corrections recorded for the maintainer are deleted */
export async function askClearHistory(n: number) {
  const text = `Delete the ${n} recorded correction(s) from this computer? Export them first if they have not been `
    + 'sent to the maintainer. The corrections in your lessons stay.'
  if (!TAURI) return confirm(text)
  const res = await message(text, { title: 'xjyutping-Tool', kind: 'warning', buttons: { ok: 'Clear history', cancel: 'Cancel' } })
  return res === 'Clear history'
}

export function setWindowTitle(title: string) {
  if (TAURI) getCurrentWindow().setTitle(title)
  else document.title = title
}

export async function setFullscreen(on: boolean) {
  if (TAURI) await getCurrentWindow().setFullscreen(on)
}

const faces = new Map<string, Promise<boolean>>()
const wanted: Record<string, string> = {}

/** shows a font of the PDF in the window, as the CSS variable (--chinese-font or
    --jyutping-font) that app.css uses; until it is loaded, and outside the app,
    the system fonts are used */
export async function useFont(variable: string, font: Font) {
  if (!TAURI) return
  wanted[variable] = font.file
  const ok = await loadFont(font)
  // a later choice wins over a font that finished loading after it
  if (wanted[variable] !== font.file) return
  if (ok) document.documentElement.style.setProperty(variable, `"xjp ${font.file}"`)
  else document.documentElement.style.removeProperty(variable)
}

/** loads a font as the family "xjp <file>": a bundled one from the texbundle (within the
    asset scope of tauri.conf.json), an installed one from the bytes the app reads; a font
    that fails (one not installed yet) is tried again next time */
export function loadFont(font: Font) {
  if (!faces.has(font.file)) {
    faces.set(font.file, (async () => {
      const source = font.system
        ? await invoke<ArrayBuffer>('system_font_data', { postscript: font.postscript, hint: font.hint })
        : `url("${convertFileSrc(await resolveResource(`texbundle/${font.file}`))}")`
      document.fonts.add(await new FontFace(`xjp ${font.file}`, source).load())
      return true
    })().catch(() => {
      faces.delete(font.file)
      return false
    }))
  }
  return faces.get(font.file)!
}

/** where an installed font is and the code points it has, or null if it is not installed */
export async function systemFont(font: Font) {
  if (!TAURI) return null
  return invoke<{ path: string; ranges: [number, number][] } | null>('system_font', { postscript: font.postscript, hint: font.hint })
}
