// The shapes of the JSON exchanged with py/app.py.

export type Kind = 'char' | 'word' | 'sentence'
export type Audience = 'en' | 'zh' | 'yue'
/** the switches of the PDF settings */
export type PdfOption = 'toneChart' | 'evenSpacing' | 'fancy' | 'separatePages'

/** one code point of a line, as py/app.py render() gives it */
export type Item = {
  c: string
  a: string | null // xjyutping's reading
  r: string | null // the reading shown, after corrections
  type: string | null // w, u, m or s
  seg: number | null
  src: 'auto' | 'word' | 'spot' | null
  cjk: boolean
  key: string | null // the word correction that applies here
  at: number | null // where that correction's occurrence starts
  nofont: string | null // the chosen font that has no glyph for it
  printedIn: string | null // the font that prints it instead; null: it prints as a blank
}

export type Row = {
  line: string
  items: Item[]
  segs: number[][]
  cjk: boolean
  auto: Kind | null
  kind: Kind | null
  duplicate: boolean
}

export type Lesson = {
  format: 1
  title: string
  author: string
  date: string
  audience: Audience
  toneChart: boolean
  evenSpacing: boolean // false: each character only as wide as its own Jyutping
  fancy: boolean
  separatePages: boolean
  chineseFont: string // ids of py/fonts.json
  jyutpingFont: string
  text: string
  words: Record<string, string>
  spots: Record<string, Record<string, string>>
  kinds: Record<string, Kind>
}

/** a font of py/fonts.json */
export type Font = { id: string; kind: 'chinese' | 'jyutping'; name: string; style: string; file: string; default?: boolean }

export type Candidates = { given: string[]; auto: string | null; all: string[] }
export type Check = { value: string; valid: boolean; known: boolean }
