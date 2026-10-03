// The user's xjyutping package and py/app.py, running under Pyodide in the
// window. Every call passes JSON in and out, which avoids leaking proxies.
import { loadPyodide } from 'pyodide'
import type { Candidates, Check, Lesson, Row } from './types'

let py: any = null

export async function startPython() {
  const timeout = new Promise<never>((_, fail) => setTimeout(() => fail(new Error('timed out after 30 s')), 30000))
  const pyodide = await Promise.race([loadPyodide({ indexURL: '/pyodide/' }), timeout])
  pyodide.unpackArchive(await (await fetch('/py.zip')).arrayBuffer(), 'zip')
  py = pyodide.pyimport('app')
}

const json = (x: unknown) => JSON.stringify(x)

export const python = {
  render: (lesson: Lesson): Row[] => JSON.parse(py.render(json(lesson))),
  candidates: (lesson: Lesson, row: number, i: number): Candidates => JSON.parse(py.candidates(json(lesson), row, i)),
  check: (s: string): Check => JSON.parse(py.check(s)),
  clean: (text: string): { lesson: Lesson; dropped: string[] } => JSON.parse(py.clean(text)),
  migrate: (lesson: Lesson, oldText: string): { lesson: Lesson; lost: number; moves: [string, number, string, number][] } =>
    JSON.parse(py.migrate(json(lesson), oldText)),
  makeTex: (lesson: Lesson): string => py.make_tex(json(lesson)),
  versions: (): Record<string, string> => JSON.parse(py.versions()),
}
