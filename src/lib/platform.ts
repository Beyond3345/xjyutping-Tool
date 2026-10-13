// What the window needs from the app around it: storage, the Rust commands of
// src-tauri/src/main.rs, the window itself and the fonts of the PDF. In a plain
// browser (npx vite) the store falls back to localStorage and files are off.
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { resolveResource } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { message } from '@tauri-apps/plugin-dialog'
import { load } from '@tauri-apps/plugin-store'

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

export const commands = {
  exportPdf: (tex: string, name: string) =>
    invoke<{ path: string | null; missing: string[] }>('export_pdf', { tex, name }),
  openLesson: () => invoke<[string, string] | null>('open_lesson'),
  saveLesson: (contents: string, name: string, path: string | null) =>
    invoke<string | null>('save_lesson', { contents, name, path }),
  exportCorrections: (contents: string, name: string) =>
    invoke<string | null>('export_corrections', { contents, name }),
  selfTest: () => (TAURI ? invoke<boolean>('self_test') : Promise.resolve(false)),
  selfTestDone: (report: string, tex: string | null) => invoke('self_test_done', { report, tex }),
}

/** asks before replacing a lesson with unsaved changes */
export async function askSaveDiscard(): Promise<'Save' | 'Discard' | 'Cancel'> {
  const res = await message('This lesson has changes that are not saved in a lesson file.',
    { title: 'xjyutping-Tool', kind: 'warning', buttons: { yes: 'Save', no: 'Discard', cancel: 'Cancel' } })
  if (res === 'Save') return 'Save'
  if (res === 'Discard') return 'Discard'
  return 'Cancel'
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
export async function useFont(variable: string, file: string) {
  if (!TAURI) return
  wanted[variable] = file
  const ok = await loadFont(file)
  // a later choice wins over a font that finished loading after it
  if (wanted[variable] !== file) return
  if (ok) document.documentElement.style.setProperty(variable, `"xjp ${file}"`)
  else document.documentElement.style.removeProperty(variable)
}

/** loads a font file of the texbundle (within the asset scope of tauri.conf.json) as the family "xjp <file>" */
export function loadFont(file: string) {
  if (!faces.has(file)) {
    faces.set(file, (async () => {
      const face = new FontFace(`xjp ${file}`, `url("${convertFileSrc(await resolveResource(`texbundle/${file}`))}")`)
      document.fonts.add(await face.load())
      return true
    })().catch(() => false))
  }
  return faces.get(file)!
}
