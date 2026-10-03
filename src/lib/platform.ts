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

/** the fonts of the PDF, so that the preview looks like it (system fonts otherwise) */
export async function loadFonts() {
  if (!TAURI) return
  for (const [family, file] of [['IMing', 'I.Ming-8.10.ttf'], ['NotoSerifHK', 'NotoSerifCJKhk-Regular.otf']]) {
    try {
      const face = new FontFace(family, `url("${convertFileSrc(await resolveResource(`texbundle/${file}`))}")`)
      document.fonts.add(await face.load())
    } catch { /* the system fonts in app.css are used instead */ }
  }
}
