# xjyutping-Tool

This project is a desktop teaching tool for Cantonese lessons, built on the
xjyutping packages. It is for teachers who want their vocabulary and sentences
shown with Jyutping above every character while they type in class, and a
vocabulary list for the students at the end of the lesson. The tool runs on
macOS and Windows and needs neither Python nor TeX on the computer, since both
are bundled with it.

## What it does

The window is divided into two parts. On the left, the teacher types one word
or sentence per line, and on the right every line appears at once with its
Jyutping above the characters. The readings come from
[xjyutping-py](https://github.com/Beyond3345/xjyutping-py), which runs inside
the app, so they are exactly the readings of the
[xjyutping](https://github.com/Beyond3345/xjyutping-tex) LaTeX package.

When a reading is wrong, or the teacher prefers another one, a click on the
character opens an editor with the possible readings. At the end of the lesson,
Generate PDF writes a vocabulary list typeset by the xjyutping LaTeX package,
with a title, the author and the date, and with the entries grouped into
characters, words and sentences. The characters and the words are set in
tables of the characters with their Jyutping, the Jyutping on its own and a
blank column for the students, while each sentence is written out with its
Jyutping above the characters and lines under it. The blank column and the
lines are headed English or 普通話 for translation, or 筆記 for notes when the
students already speak Cantonese, and the vocabulary list can start with a
chart of the six tones.

## Installing

### macOS

1. Open `xjyutping-Tool_<version>_universal.dmg` and drag xjyutping-Tool into Applications
2. Open the app once from Applications, then allow it in System Settings, Privacy & Security, "Open anyway"

The second step is needed because the app is not signed with an Apple
Developer ID. The app needs macOS 13.3 or later and runs on both Apple Silicon
and Intel Macs.

### Windows

1. Run `xjyutping-Tool_<version>_x64-setup.exe`
2. If SmartScreen warns about an unknown publisher, choose "More info", then "Run anyway"

The installer installs for the current user only and needs no administrator
rights. It uses Microsoft Edge WebView2, which Windows 11 and updated Windows
10 already include; on a computer without it and without internet access, the
installer cannot add it.

## Using the tool

1. Enter the title, the author and, if it should not be today, the date
2. Choose whether the students speak English, Mandarin (普通話) or Cantonese (廣東話), and tick Tone chart if the list should start with the six tones
3. Type the vocabulary and sentences on the left, one per line
4. Check the readings on the right and correct any by clicking the character
5. Click Generate PDF and choose where to save the vocabulary list

Characters that xjyutping has to guess between several readings are underlined
with orange dots, so they are the ones to check first. A red `?` marks a
character with no reading in the data, which must be given one before the PDF
can be made, and a dashed red box marks a character that neither font of the
PDF contains, which would print as a blank.

### Correcting a reading

The editor applies a correction in one of two ways, and its first line says
which.

- A correction to a word applies to that word in the whole lesson, including
  inside sentences typed later, wherever xjyutping reads those characters as
  that word. Clicking any character of a word, shown with a thin line under it,
  opens the word. The buttons ◀ + and + ▶ add the neighbouring characters, so
  that two characters xjyutping reads separately can be corrected as one word.
- A correction to a character that stands alone applies to that place only.
  The same character elsewhere keeps xjyutping's reading, since it is usually
  read in the standard way there.

Word corrections are shown with a blue line under the word, and character
corrections in blue. Saving the reading xjyutping gave removes the correction,
and so does Reset. Corrections (n) lists the corrections of the lesson, each
with its own Reset.

### Characters, words and sentences

The tag at the end of each line says in which part of the PDF the line will be
printed. A line with one character goes to Characters, a word or a short
phrase without sentence punctuation goes to Words, and anything else goes to
Sentences. Clicking the tag changes this (automatic, Character, Word,
Sentence). A line that appears twice is printed once.

Characters and words are printed in tables, and sentences are written out on
their own, each with its Jyutping above the characters and one to three lines
under it for the translation or notes, depending on its length.

### The tone chart

With Tone chart ticked, the vocabulary list starts with a chart of the six
tones of Cantonese, drawn as arrows over five pitch levels (1 陰平 55, 2 陰上
35, 3 陰去 33, 4 陽平 21, 5 陽上 13, 6 陽去 22). In lessons for Mandarin or
Cantonese speakers the labels are the traditional names, and in lessons for
English speakers they read, for example, "Tone 1 (陰平) High level". The choice
is kept in the lesson, and a new lesson keeps the choice of the previous one.

### Lessons

New, Open and Save work with lesson files (`.jyutlesson`), which keep the
text, the title, the author, the date, the students' language and all
corrections. The lesson on screen is also kept between launches, so closing
the app loses nothing, and New and Open ask before replacing changes that are
not saved in a file.

### Presenting in class

A− and A+ change the size of the annotated text, and Present shows only the
annotated text on the whole screen, without the input and the marks. Esc
leaves it.

### Sending corrections to the maintainer

Every correction is also recorded in a small database on the computer, so
that the readings of xjyutping can be improved. In Corrections (n), "Export
all corrections" writes them to `xjyutping-corrections-<date>.json`, which can
be sent to the maintainer through the
[issues of xjyutping-tex](https://github.com/Beyond3345/xjyutping-tex/issues).
Each record holds the word or character, the reading xjyutping gave, the
corrected reading, the line it was corrected in and the versions used, and
nothing leaves the computer unless the teacher sends the file.

## How it works

The tool is mainly divided into three parts, the window, the readings and the
PDF.

- The window is a [Tauri](https://tauri.app) 2 app whose interface is written
  in [Svelte](https://svelte.dev) 5 (`src/App.svelte`, `src/components/` and
  `src/lib/`) and follows the system's light or dark mode. The Rust side
  (`src-tauri/src/main.rs`) only runs the TeX engine and reads and writes the
  files chosen in dialogs.
- The readings come from xjyutping-py, unchanged, running under
  [Pyodide](https://pyodide.org) inside the window. `py/app.py` applies the
  corrections on top of xjyutping's reading and writes the LaTeX source.
  Corrections never change how xjyutping divides a line into words, so a
  correction cannot change the reading of another line.
- The PDF is typeset by [Tectonic](https://tectonic-typesetting.github.io)
  0.17.0, a self-contained XeTeX engine shipped inside the app, from the
  TeX Live 2024 files the template needs (`tex/tl2024/`), the xjyutping package and
  the fonts I.Ming and Noto Serif CJK HK (for the characters I.Ming lacks).
  Every entry is written with `\xjyutping{<entry>}{<readings>}`, which gives
  each character the reading shown on screen, so the PDF always matches the
  window.

The table style follows the vocabulary tables of the workspace's
`test/main.tex`: centred columns, inner vertical rules only and a double line
under the header.

## Building from source

The tool reads xjyutping from the two sibling repositories, so the three
repositories sit side by side, as in the workspace.

```
xjyutping/
  xjyutping-Tool/   this repository
  xjyutping-py/     https://github.com/Beyond3345/xjyutping-py
  xjyutping-tex/    https://github.com/Beyond3345/xjyutping-tex
```

1. Install Node.js and Rust, and on macOS run `rustup target add x86_64-apple-darwin`
2. Run `npm ci` in `xjyutping-Tool`
3. Run `npm run tauri dev` to try the app
4. Run `CI=true npm run tauri build -- --target universal-apple-darwin` for the macOS app and `.dmg`

The `CI=true` makes Tauri skip arranging the `.dmg` window through Finder,
which fails when the build does not run in a logged-in Terminal. Before each
run, `scripts/vendor.mjs` copies the Python package, the
xjyutping LaTeX package and the Pyodide runtime into the app and downloads
Tectonic and the fonts, each checked against a pinned sha256 and cached in
`.downloads/`. The environment variables `XJYUTPING_PY` and `XJYUTPING_TEX`
point it at other copies of the two repositories.

The released installers are built by GitHub Actions
(`.github/workflows/build.yml`), since Tauri cannot build the Windows one on a
Mac. The workflow checks out xjyutping-py and xjyutping-tex at the commits
given at its top and builds the Windows installer and the macOS `.dmg`, each
checked with the self-test described under Testing.

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, and add its entry to `CHANGELOG.md`
2. Commit, then push a tag such as `v1.0.0`

The tag creates a draft release with the notes of that version from
`CHANGELOG.md`, both installers are attached to it, and it is published once
both builds have passed. Started by hand, the workflow only builds, and the
installers are kept as artifacts of the run.

### Changing the app icon

The icon is made from `src-tauri/icons/icon-source.png`, the character 粵 in
brush ink on a white tile with rounded corners (1024 by 1024 pixels).

1. Replace `src-tauri/icons/icon-source.png`
2. Run `npx tauri icon src-tauri/icons/icon-source.png`
3. Delete the `android` and `ios` folders it writes into `src-tauri/icons`

### Changing the PDF template

The template is in `make_tex` and `PREAMBLE` in `py/app.py`. Since the bundle
holds only the TeX files the template uses, a change that needs another file,
such as a new package or font size, needs the bundle rebuilt.

1. Run `PYTHONPATH=../xjyutping-py/src:py python3 scripts/harvest_bundle.py`
2. Run `scripts/compile-check.sh` and look at the pages in `.downloads/check/`

The first step compiles `tests/fixture-lesson.json`, with the tone chart, for
the three audiences against the official TeX Live 2024 bundle of Tectonic,
downloading only the files that are used, and copies them into `tex/tl2024/`.
The second compiles the fixture again from the bundle of the app, with an
empty cache and without network.

## Testing

- `PYTHONPATH=../xjyutping-py/src:py python3 -m pytest py/test_app.py` tests
  the readings, the corrections, the sorting and the LaTeX source
- `scripts/compile-check.sh` compiles the fixture lesson with the bundled
  engine and renders the pages to PNG (with `--engine-only` it skips the
  rendering, as in CI)
- `npm run check` checks the types of the interface with svelte-check, which
  also runs before every build
- `cargo test` in `src-tauri` tests the file name and log helpers
- `xjyutping-Tool --self-test <file>` runs a built app on a sample lesson with
  corrections, compiles it with the bundled engine without asking where to
  save, writes a report to the file and quits with 0 on success (on macOS the
  program is `xjyutping-Tool.app/Contents/MacOS/xjyutping-Tool`, and CI runs
  it on Windows)

## Licences

The code of this repository is released under the MIT licence (`LICENSE`).
The app also ships the following, each under its own licence.

| Part | Licence |
| --- | --- |
| xjyutping-py and the xjyutping LaTeX package | MIT and LPPL 1.3c for the code, CC BY-SA 4.0 for the data |
| Pyodide | MPL 2.0 |
| Tectonic | MIT |
| TeX Live 2024 files in `tex/tl2024/` | the free licences of each package, mostly LPPL; see `tex/NOTICE.md` |
| I.Ming 8.10 | IPA Font License 1.0 |
| Noto Serif CJK HK | SIL Open Font License 1.1 |

## Troubleshooting

### The app shows "The dictionary could not be loaded"

The readings run in the system's web view, which on macOS is Safari's engine.
It needs macOS 13.3 or later, and on Windows an up-to-date Microsoft Edge
WebView2.

### The first PDF takes longer

The first Generate PDF after installing prepares the TeX engine (about 5 s),
and later ones take about 2 s.

### A character prints as a blank

Neither I.Ming nor Noto Serif CJK HK contains it, which the dashed red box
shows before generating. The tool lists such characters after Generate PDF,
and replacing the character with a common variant is the only fix.
