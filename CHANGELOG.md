# Changelog

This file records all notable changes to xjyutping-Tool. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The version is written in three places, `package.json`, `src-tauri/Cargo.toml`
and `src-tauri/tauri.conf.json`, and a release bumps all three and gets an
entry in Part I.

The file is divided into two parts. Part I (Releases) lists what changed in
each version. Part II (Handover notes) covers how the tool was built and how it
works, the problems found during development with their causes and fixes, the
open issues and how to test. This part is written for the next maintainer,
human or agent.

---

# Part I: Releases

## [Unreleased]

There are no unreleased changes yet. Add new entries here under
`### Added`, `### Changed`, `### Fixed` and so on.

## [1.1.0] - 2026-10-03

### Added

- A third choice for the students' language, Cantonese (廣東話). The blank
  column and the lines of the sentences are then headed 筆記, for notes, and the
  fixed text of the PDF is Chinese.
- Tone chart: a vocabulary list can start with a chart of the six tones, five
  pitch levels with the tones as coloured arrows (55, 35, 33, 21, 13, 22),
  labelled with the traditional names, or for English speakers with English
  names and the traditional ones ("Tone 1 (陰平) High level"). The checkbox is
  kept in the lesson, and a new lesson keeps the previous choice.
- A new app icon, the character 粵 in brush ink on a white tile.

### Changed

- Sentences are no longer set in a table. Each is written out with its
  Jyutping above the characters and one to three lines under it, headed
  English, 普通話 or 筆記, for the translation or notes, since the plain Jyutping
  of a long sentence made the table crowded.

## [1.0.0] - 2026-10-02

### Added

- A window with the lesson's title, author, date and the students' language
  (English or 普通話) at the top, the text typed one entry per line on the
  left and the same lines with Jyutping above every character on the right.
- Corrections by clicking a character. A correction to a word applies in the
  whole lesson, including inside later sentences, while a correction to a
  lone character applies to that place only. ◀ + and + ▶ widen a correction
  to the neighbouring characters, so that a word xjyutping reads separately
  can be corrected as one.
- Marks for the characters to check: guessed polyphones, characters with no
  reading (which block the PDF) and characters that neither font of the PDF
  contains.
- Generate PDF: a vocabulary list typeset by the xjyutping LaTeX package with
  Tectonic, grouped into Characters, Words and Sentences, with three columns
  (the characters with Jyutping above them, the Jyutping and a blank column
  headed English or 普通話) in the table style of `test/main.tex`.
- Automatic sorting of the lines into characters, words and sentences, which
  the tag at the end of each line changes.
- Lesson files (`.jyutlesson`) with New, Open, Save and Save As, and the
  lesson on screen kept between launches.
- A database of all corrections on the computer, exported as a JSON file for
  the maintainer of xjyutping.
- A− and A+ for the text size, and Present for showing only the annotated text
  in full screen.
- A universal macOS app (13.3 or later) and a Windows installer built by
  GitHub Actions, neither needing Python or TeX on the computer.

---

# Part II: Handover notes

## 0. Start here

This repository holds the teaching tool, and the table below lists its files.

| Path | What it is |
| --- | --- |
| `index.html`, `src/main.ts`, `src/style.css` | The interface: lesson fields, the two panes, the correction editor, files and the PDF (Section 2.4). |
| `py/app.py` | The bridge to xjyutping-py: readings with corrections, sorting, candidates, checks and the LaTeX source (Sections 2.2 and 2.3). |
| `py/test_app.py` | The tests of `app.py` (39 tests). |
| `py/glyphs.txt` | The code points that I.Ming or Noto Serif CJK HK contain, made once by `scripts/glyphs.py`. |
| `src-tauri/src/lib.rs` | The Rust commands: compile with Tectonic, open and save lessons, export corrections, and the self-test (Section 2.7). |
| `src-tauri/icons/icon-source.png` | The source of every app icon (Section 6.4). |
| `src-tauri/tauri.conf.json`, `capabilities/default.json` | The app, its bundle (sidecar, resources) and what the window may call. |
| `scripts/vendor.mjs` | Assembles the generated parts before every build (Section 2.6). |
| `scripts/harvest_bundle.py` | Rebuilds `tex/tl2024/` from the template (Section 2.5). |
| `scripts/compile-check.sh` | Compiles the fixture offline with the bundled engine and renders it. |
| `tests/fixture-lesson.json` | The lesson used by the harvest and the compile check. |
| `tex/tl2024/`, `tex/NOTICE.md` | The TeX Live 2024 files of the template and their licences. |
| `.github/workflows/build.yml` | The release: builds and self-tests the Windows and macOS installers and publishes them for a `v*` tag. |

The following invariants must be kept.

1. The PDF must show the readings shown on screen. Every entry is therefore
   written with `\xjyutping{<entry>}{<readings>}` (manual mode), and the
   Python side decides which characters take a syllable with the same test as
   `xjyutping.sty` (lines 2343–2359): a character with data, or in U+3400–4DBF,
   4E00–9FFF, F900–FAFF or 20000–3FFFF.
2. Corrections never change how xjyutping divides a line (Section 2.2), so a
   correction can only change the readings it covers.
3. The xjyutping packages are not copied into this repository. `vendor.mjs`
   reads them from the sibling repositories, and CI checks them out at the
   commits written in `build.yml`.
4. After a change to the template, rebuild the bundle with
   `harvest_bundle.py` and run `compile-check.sh`, since the bundle holds only
   the files the template uses.

## 1. Origin

### 1.1 The request

The user asked for a classroom tool built on the xjyutping LaTeX and Python
packages: Cantonese typed on the left is shown on the right with Jyutping above
the characters, a click on a character corrects its reading, the corrections
are remembered, and a button generates a vocabulary list in LaTeX with a title
and author for `\maketitle`, in the table style of `test/main.tex` with the
Mandarin or English column left blank for students, the language chosen in the
UI. Everything had to be packaged with Tauri as an installer that needs no
Python or TeX.

### 1.2 Answers to the questions asked

- macOS and Windows, with a universal macOS app (Apple Silicon and Intel), unsigned, with the Windows installer built by GitHub Actions.
- A word correction stays for the whole lesson, including in later sentences, while a character standing alone that is corrected keeps the standard reading elsewhere. All word corrections also go into a local database that can be sent to the maintainer, as an exported file.
- Continuous entry, one entry per line, with the PDF separating characters, words and sentences automatically and adjustably.
- The PDF only (no `.tex`), and lessons saved and reopened as files.
- Three columns (characters with rubies, Jyutping, blank), one column per page, the font I.Ming as in `test/main.tex`, with Noto Serif CJK HK as fallback for the characters I.Ming lacks.

## 2. Architecture

### 2.1 Processes

The interface runs in Tauri's web view. The readings come from xjyutping-py
running under Pyodide 314.0.7 in the same web view, so there is no Python
process and nothing to sign or build per platform. The PDF is compiled by the
Tectonic 0.17.0 command-line program, shipped as a Tauri sidecar and run from
Rust. The measurements of the spike on this Mac (production build, Apple
Silicon) were 1.0 s to load Pyodide, 0.12 s to build `Jyutping()` and 7 ms to
read 100 lines of 20 characters.

### 2.2 Corrections

The lesson is one JSON object,

```
{format, title, author, date, audience: 'en'|'zh', text,
 words: {text: "r1 r2 …"}, spots: {line: {code point index: syllable}}, kinds: {line: kind}}
```

Each line is segmented once by a plain `Jyutping()`, and the corrections are
applied on top, a spot before a word before the automatic reading. A word
correction replaces the readings of every occurrence of its text that starts
and ends on segment boundaries, so it reaches later sentences wherever
xjyutping reads those characters as whole segments, and it never cuts a
dictionary word (行街 does not apply inside 步行|街). A spot applies to a
character that is not inside a word of two or more characters, including a
character with no data.

We did not use `set_jyutping` for word corrections, although it is the
package's own mechanism. A user word gets cost 0, and the review measured that
saving a word with its own reading changed the readings of other lines in
2,736 of 12,564 overlapping pairs of frequent words (步行街 becomes 步|行街,
佢唔好奇 becomes 唔好|奇). Since TeX receives explicit readings, parity with
`\setjyutping` is not needed either.

The corrections database is a store file (`corrections.json` in the app's data
folder) with one record per correction, keyed `w|<word>` or
`c|<line>|<index>`, holding the automatic and corrected readings, the line, the
time and the versions of xjyutping-py, xjyutping-tex and the app. A Reset
deletes its record.

### 2.3 The LaTeX source

`make_tex` checks every syllable against `^[a-z]+[1-6]$`, which also keeps
TeX code out of the readings, and refuses a lesson with a character that has
no reading. It escapes the title, author, date, entries and the plain-Jyutping
column in one pass. The template was written from scratch with the look of the
vocabulary tables of `test/main.tex`, whose text is copyrighted and was never
copied. The xeCJK setup needed two lines that are easy to get wrong,

```
\usepackage[AutoFallBack=true]{xeCJK}
\xeCJKDeclareCharClass{CJK}{"2EBF0 -> "2EE5F, "31350 -> "323AF}
```

since `AutoFallBack` is a package option of xeCJK 3.9 (not a font option), and
xeCJK's CJK class stops at U+3134F while the data has characters up to
U+323AF (without the second line, 𱍐 is set in Latin Modern and its ruby is
lost). The characters are set in `\Large` with `ratio=0.5`, which gives about
7 pt Jyutping.

### 2.4 The interface

`src/main.ts` holds the lesson and draws each line from the JSON of
`app.render`, as one `<ruby>` per character. It does not re-render while an
input method composes, it moves a line's spots and kind when the line is
edited (by common prefix and suffix, in `app.migrate`), and it keeps the draft
in the store. In a plain browser (`npx vite`), it uses `localStorage` instead
of the store, so the interface can be tried without Tauri; only the files and
the PDF then need the app.

### 2.5 The TeX engine and its bundle

Tectonic's default bundle is TeX Live 2022, whose kernel lacks
`\ProcessKeyOptions` and the e-type expl3 functions that xjyutping needs. The
TeX Live 2024 bundle (LaTeX 2023-11-01, l3kernel 2024-02-20) has all 268 expl3
functions xjyutping uses, and the regression test of xjyutping-tex gives
readings identical to `tests/regression.expected` under Tectonic, online and
offline. Only the hook `build/page/reset` (LaTeX 2025-06) is missing, so
running heads would get rubies, which does not matter with
`\pagestyle{plain}`.

The app ships only the files the template uses. `harvest_bundle.py` compiles
the fixture against the bundle's URL (range requests fetch only the files
used), checks the bundle hash against Tectonic's official `bundle.toml` and
flattens the cache into `tex/tl2024/` (286 files, 15.6 MB). Two traps were
found on the way: a local copy of the `.ttb` file is read directly and never
cached, so it gives nothing to harvest, and Tectonic 0.17.0 panics
(`ttb_net.rs:185`) when a cached index meets an uncached file in a new
process, so the script deletes the index before each run. The app runs
`tectonic -b texbundle` from its resource folder, since a Windows path such as
`C:\…` given to `-b` is read as a URL.

### 2.6 Building

`vendor.mjs` runs before `vite` and `vite build`. It copies the Pyodide
runtime, zips `app.py`, `glyphs.txt`, `versions.json` and the xjyutping package
into `public/py.zip` (stored, so that Tauri's brotli compresses the tables),
assembles `src-tauri/resources/texbundle/` with a `SHA256SUM` (Tectonic keys
its format cache on it) and places the Tectonic binary for the target triple.
A universal macOS build needs three sidecars, one per architecture for the
two compile passes and the merged one for the bundle, and `CI=true` lets the
`.dmg` be made without Finder scripting, which fails outside a logged-in
Terminal.

### 2.7 The self-test

Since the app's window and dialogs cannot be driven from a script on macOS,
a built app accepts `--self-test <report file>`. The window then loads
Pyodide, reads a sample lesson with a word and a spot correction, and the Rust
side compiles it exactly as Generate PDF does, but without the save dialog,
writes the readings, timings and result to the file and quits with 0 on
success. The release workflow runs it after each build. On this Mac the
universal app reported Python loaded in 1.2 s, the corrected readings (銀行
*ngan4 haang4* inside the sentence, 𠮶 *go2*) and a PDF, in 5.4 s in all.

## 3. Development log (2026-10-02)

1. We researched the packages, the table style of `test/main.tex`, Tectonic
   with its bundles and Tauri's sidecars and Python options. A skeptical check
   then confirmed that only a TeX Live 2024 or later bundle can run
   xjyutping.
2. A review of the first plan from three angles (requirements, readings,
   packaging) found the leaking `set_jyutping` (Section 2.2), the empty
   harvest of a local `.ttb`, Tectonic writing no log without `--keep-logs`,
   spots not applying to characters with no data and the missing glyphs of
   I.Ming (2,189 characters of the data), all fixed in the plan before
   building.
3. Two spikes ran in parallel: Tectonic with the TeX Live 2024 bundle on
   xjyutping's regression test (identical readings, offline under
   `sandbox-exec`) and Pyodide in a production Tauri build (working, figures
   in Section 2.1).
4. During building, the harvest missed `lmroman7-regular.otf` after the
   ruby size changed to 7.2 pt, which gave "not loadable" and confirmed
   invariant 4, and I.Ming copied from `~/Library/Fonts` kept the mode 700, so
   `vendor.mjs` now makes every bundled file readable by all users.
5. A last review of the code from three angles (interface, Rust and
   packaging, Python and LaTeX) found 19 defects, all fixed with tests where
   they concern `app.py`. The main ones were,
   - a word that xjyutping joins across a space (銀 行) could not be
     corrected, since the spot was ignored and the word never matched,
   - editing a line into a copy of another line overwrote that line's
     corrections (`migrate` now leaves them),
   - control characters, such as the soft line break PowerPoint pastes, and
     the ligatures `<<`, `>>` and `,,` broke or changed the PDF,
   - the editor lost what was typed in one field when another was focused,
     and two adjacent copies of a corrected word opened the wrong span
     (`render` now gives each occurrence its start, `at`),
   - Save while Python was still loading dropped every spot, and text typed
     during loading was ignored,
   - the Windows checkout would have given `compile-check.sh` CRLF endings
     (`.gitattributes` and `core.autocrlf false`), and
   - errors of Tectonic and of the file commands reached the teacher as a
     generic line or not at all.

## 4. Open issues

- The Windows installer is checked only by the self-test of the workflow
  and must still be tried by hand on a Windows computer without TeX or Python,
  including a user name with non-ASCII characters.
- A sentence whose row is taller than a page cannot break across pages
  (`longtable` rows do not split), so it moves to the next page whole.
- The app is not signed, so macOS and Windows ask once before opening it.
- Characters that neither font contains print as a blank; they are marked
  before generating and listed after it.

## 5. How to test

```bash
PYTHONPATH=../xjyutping-py/src:py python3 -m pytest py/test_app.py
```

```bash
scripts/compile-check.sh
```

```bash
cd src-tauri && cargo test
```

The first runs the 39 tests of `app.py`, the second compiles the fixture for
both audiences with the bundled engine from an empty cache without network
and renders the pages to `.downloads/check/`. The third tests the Rust
helpers.

## 6. Version 1.1.0 (2026-10-03)

### 6.1 The request

After 1.0.0, the user asked for a third choice of the students' language,
Cantonese speakers, whose blank column is headed 筆記; for the attached brush
character 粵 on white as the logo; for an option to start each vocabulary
list with a version of an attached chart of the six tones, without adding
much to the TeX engine; and, before the release, for sentences without the
table, since their plain Jyutping made it crowded. The questions asked gave
the chart as drawn (levels 1–5, 55 35 33 21 13 22, the colours of the image),
English names followed by the traditional ones in English lessons, a white
tile with rounded corners for the icon and a release as 1.1.0.

### 6.2 Cantonese speakers and the sentences

The audience is now one of `en`, `zh` and `yue` (`_audience` in `app.py`,
with `en` as fallback for anything else). `TEXT['yue']` is the Chinese text
of `zh` with `blank: '筆記'`, and the date is written in Chinese for both. In
the UI it is the third radio button, 廣東話.

Sentences are written by `_sentence`: the sentence in `\Large` with its
readings through `\xjyutping{…}{…}`, as before, then the label (English:,
普通話： or 筆記：) and one writing line per 15 characters, at most three, all
in a `minipage` so that a sentence never splits across pages. The plain
Jyutping of a sentence is no longer printed, since the rubies carry it.

### 6.3 The tone chart

The chart is drawn by TeX in `picture` mode with `pict2e` (arrows at any
slope, thick lines) and `color`, which the preamble loads only when the
lesson asks for the chart. We chose this over TikZ, which would have added
several MB of files to the bundle, and over a prepared image, which would
have needed `graphicx` and a separate file to keep in step with the fonts.
The harvest with the chart added eight files (`pict2e.sty`, `pict2e.cfg`,
`p2e-xetex.def`, `color.sty`, `color.cfg`, `xetex.def`, `trig.sty` and
`mathcolor.ltx`), and `tex/tl2024/` grew from 15.6 to 15.7 MB.

`TONES` in `app.py` holds, for each tone, the start and end pitch level, where
the arrow starts and ends across the chart, its colour, the positions of the
Chinese and of the two-line English label and the names. Each label sits on a
white box, so that the dotted levels do not run through it. The positions
were set by rendering both versions, so a change to the names or the font
should be checked the same way (`scripts/compile-check.sh`). The fixture
lesson has the chart on, so the harvest and the compile check cover it, and
so does the self-test of the built app.

### 6.4 The icon

`src-tauri/icons/icon-source.png` was made once from the attached image with
PIL. The paper texture was whitened (grey levels above 200 set to white, the
ink kept), the ink cropped to its bounding box with a margin, and the
character centred at 78% of a white tile of 824 pixels with corners of 185
pixels on a transparent 1024 by 1024 canvas, with a faint shadow, as macOS
icons are drawn. `npx tauri icon` then made every size, and the Android and
iOS sets it also writes were deleted. The character still reads at 32
pixels.

### 6.5 Tests

`py/test_app.py` has three more tests: the Cantonese audience, the tone chart
only when asked (with the English and the Chinese labels), and the sentences
with their lines for each language. `scripts/compile-check.sh` now compiles
the fixture for all three audiences.
