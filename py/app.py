"""Bridge between the xjyutping-Tool UI and xjyutping.

The UI passes a lesson as JSON and gets JSON back (render, candidates, check,
clean, migrate) or the LaTeX source of the vocabulary list (make_tex).
Corrections are applied on top of xjyutping's segmentation and never change
it: a word correction replaces the readings of every occurrence of the word
that starts and ends on segment boundaries, and a spot correction replaces the
reading of one lone character in one line.
"""
import bisect
import datetime
import functools
import json
import os
import re
import unicodedata
from pathlib import Path

import xjyutping
from xjyutping import Jyutping

SYL = re.compile(r'^[a-z]+[1-6]$')
SENTENCE_PUNCT = set('，。！？；：…,.!?;:')
PARENS = re.compile(r'（[^）]*）|\([^)]*\)')
INVISIBLE = dict.fromkeys(map(ord, '\u200b\u200c\u200d\ufeff\r'), None)
INVISIBLE[0xa0] = ' '

_j = Jyutping()


def _is_cjk(ch, reading):
    """The test of xjyutping.sty (L2343-2359): a character with data, or in the
    CJK ideograph ranges, takes one syllable in \\xjyutping{..}{..}."""
    cp = ord(ch)
    return (reading is not None or 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF
            or 0xF900 <= cp <= 0xFAFF or 0x20000 <= cp <= 0x3FFFF)


def _lines(text):
    return [line.translate(INVISIBLE).strip() for line in text.split('\n')]


@functools.cache
def _known_syllables():
    data = Path(xjyutping.DATA_DIR)
    return {s for name in ('chars.tsv', 'words.tsv')
            for s in re.findall(r'\b[a-z]+[1-6]\b', (data / name).read_text(encoding='utf8'))}


@functools.cache
def _glyph_ranges():
    """The code point ranges of I.Ming and Noto Serif CJK HK, from glyphs.txt."""
    ranges = []
    for row in Path(__file__).with_name('glyphs.txt').read_text().split():
        lo, _, hi = row.partition('-')
        ranges.append((int(lo, 16), int(hi or lo, 16)))
    return ranges


def _printable(ch):
    """False when neither font of the PDF has the character."""
    ranges, cp = _glyph_ranges(), ord(ch)
    k = bisect.bisect_left(ranges, cp, key=lambda g: g[1])
    return k < len(ranges) and ranges[k][0] <= cp


def _read_line(line, words, spots):
    """Per code point of one line: the automatic reading and its segment, then
    the word and spot corrections of the lesson (spot > word > automatic)."""
    ann = _j.annotate(line)
    segs = _j.segment(line)
    positions = [i for i, (_, r) in enumerate(ann) if r is not None]
    seg_pos, seg_of, k = [], {}, 0
    for n, s in enumerate(segs):
        ps = positions[k:k + len(s.text)]
        k += len(s.text)
        seg_pos.append(ps)
        for p in ps:
            seg_of[p] = n
    items = []
    for i, (c, r) in enumerate(ann):
        n = seg_of.get(i)
        items.append({'c': c, 'a': r, 'r': r, 'type': segs[n].type if n is not None else None,
                      'seg': n, 'src': 'auto' if r else None, 'cjk': _is_cjk(c, r), 'key': None,
                      'at': None})
    for it in items:
        it['glyph'] = not it['cjk'] or _printable(it['c'])

    def joined(n):
        # a word of the data written without spaces; one that skips a space
        # (銀 行) is corrected character by character, as the UI offers it
        ps = seg_pos[n]
        return len(ps) > 1 and ps[-1] - ps[0] == len(ps) - 1

    def edge(p, k):
        # p starts (k=0) or ends (k=-1) its word, or is in no joined word
        n = items[p]['seg']
        return n is None or not joined(n) or seg_pos[n][k] == p

    taken = set()
    for key in sorted(words, key=len, reverse=True):
        syls = words[key].split()
        at = line.find(key)
        while at != -1:
            span = range(at, at + len(key))
            if (all(items[p]['cjk'] for p in span) and edge(at, 0) and edge(span[-1], -1)
                    and not taken.intersection(span)):
                for p, s in zip(span, syls):
                    items[p].update(r=s, src='word', key=key, at=at)
                taken.update(span)
            at = line.find(key, at + 1)
    for idx, syl in spots.items():
        p = int(idx)
        if p < len(items) and items[p]['cjk']:
            n = items[p]['seg']
            if n is None or not joined(n):
                items[p].update(r=syl, src='spot', key=None, at=None)
    return items, seg_pos


def _auto_kind(line, items, seg_pos):
    hidden = {p for m in PARENS.finditer(line) for p in range(m.start(), m.end())}
    shown = [it for p, it in enumerate(items) if p not in hidden]
    cjk = [it for it in shown if it['cjk']]
    others = [it['c'] for it in shown if not it['cjk']]
    if len(cjk) == 1 and all(c.isspace() or unicodedata.category(c).startswith('P') for c in others):
        return 'char'
    if not SENTENCE_PUNCT.intersection(others):
        segments = {it['seg'] for it in cjk}
        if len(cjk) <= 4 or (len(segments) == 1 and None not in segments):
            return 'word'
    return 'sentence'


def _rows(lesson):
    """Every line of the lesson with its items, segments and kinds."""
    words, spots, kinds = lesson.get('words', {}), lesson.get('spots', {}), lesson.get('kinds', {})
    rows, seen = [], set()
    for line in _lines(lesson.get('text', '')):
        items, seg_pos = _read_line(line, words, spots.get(line, {}))
        has_cjk = any(it['cjk'] for it in items)
        auto = _auto_kind(line, items, seg_pos) if has_cjk else None
        rows.append({'line': line, 'items': items, 'segs': seg_pos, 'cjk': has_cjk,
                     'auto': auto, 'kind': kinds.get(line, auto) if has_cjk else None,
                     'duplicate': has_cjk and line in seen})
        if has_cjk:
            seen.add(line)
    return rows


def versions():
    """Versions recorded with each correction; versions.json is written by
    scripts/vendor.mjs (the xjyutping-tex version of the bundled .sty)."""
    found = {'xjyutping_py': xjyutping.__version__}
    path = Path(__file__).with_name('versions.json')
    if path.exists():
        found.update(json.loads(path.read_text(encoding='utf8')))
    return json.dumps(found)


def render(lesson_json):
    return json.dumps(_rows(json.loads(lesson_json)), ensure_ascii=False)


def candidates(lesson_json, row, i):
    """Readings to offer for character i of a row: those the teacher already
    gave this character in the lesson, the reading in context, then all."""
    rows = _rows(json.loads(lesson_json))
    it = rows[row]['items'][i]
    ch = it['c']
    given = [x['r'] for r in rows for x in r['items'] if x['c'] == ch and x['src'] in ('word', 'spot')]
    found = given + [it['a'] or ''] + _j.get_jyutpings(ch, '', n=20)
    return json.dumps({'given': list(dict.fromkeys(given)), 'auto': it['a'],
                       'all': list(dict.fromkeys(s for s in found if SYL.match(s)))}, ensure_ascii=False)


def check(s):
    s = s.strip().lower()
    return json.dumps({'value': s, 'valid': bool(SYL.match(s)), 'known': s in _known_syllables()})


def clean(lesson_json):
    """A lesson read from a file, keeping only well-formed corrections."""
    lesson = json.loads(lesson_json)
    if not isinstance(lesson, dict):
        raise ValueError('not a lesson')
    part = lambda name: lesson.get(name) if isinstance(lesson.get(name), dict) else {}
    dropped = []
    words = {}
    for key, value in part('words').items():
        syls = str(value).split()
        if len(key) >= 2 and len(syls) == len(key) and all(SYL.match(s) for s in syls):
            words[key] = ' '.join(syls)
        else:
            dropped.append(key)
    spots = {}
    for line, marks in part('spots').items():
        if not isinstance(marks, dict):
            dropped.append(line)
            continue
        good = {}
        for i, syl in marks.items():
            if str(i).isascii() and str(i).isdigit() and isinstance(syl, str) and SYL.match(syl):
                good[str(int(i))] = syl
            else:
                dropped.append(f'{line} ({i})')
        if good:
            spots[line] = good
    kinds = {k: v for k, v in part('kinds').items() if v in ('char', 'word', 'sentence')}
    lesson.update(words=words, spots=spots, kinds=kinds, audience=_audience(lesson),
                  toneChart=lesson.get('toneChart') is True)
    for field in ('title', 'author', 'date', 'text'):
        lesson[field] = str(lesson.get(field) or '')
    return json.dumps({'lesson': lesson, 'dropped': dropped}, ensure_ascii=False)


def migrate(lesson_json, old_text):
    """Carry the spots and kind of the one line that was edited over to its new
    text: positions before the change stay, positions after it shift, and those
    inside the edited part are dropped (counted in 'lost')."""
    lesson = json.loads(lesson_json)
    old, new = _lines(old_text), _lines(lesson.get('text', ''))
    lost, moves = 0, []
    if len(old) == len(new):
        changed = [(a, b) for a, b in zip(old, new) if a != b]
        if len(changed) == 1:
            a, b = changed[0]
            pre = len(os.path.commonprefix([a, b]))
            suf = len(os.path.commonprefix([a[pre:][::-1], b[pre:][::-1]]))
            spots = lesson.get('spots', {})
            # an edit that makes the line equal to another keeps that line's own corrections
            alone = new.count(b) == 1
            if a in spots and a not in new and alone:
                moved = {}
                for i, s in spots.pop(a).items():
                    i = int(i)
                    j = i if i < pre else i + len(b) - len(a) if i >= len(a) - suf else None
                    if j is None:
                        lost += 1
                    else:
                        moved[str(j)] = s
                        moves.append([a, i, b, j])
                if moved:
                    spots[b] = moved
            kinds = lesson.get('kinds', {})
            if a in kinds and a not in new and alone:
                kinds[b] = kinds.pop(a)
    return json.dumps({'lesson': lesson, 'lost': lost, 'moves': moves}, ensure_ascii=False)


# --- LaTeX -----------------------------------------------------------------

TEX_ESCAPE = {'\\': r'\textbackslash{}', '{': r'\{', '}': r'\}', '&': r'\&', '%': r'\%',
              '$': r'\$', '#': r'\#', '_': r'\_', '~': r'\textasciitilde{}',
              '^': r'\textasciicircum{}', '-': '-{}', '`': r'\textasciigrave{}',
              "'": r'\textquotesingle{}', '"': r'\textquotedbl{}'}
# punctuation of the line as it appears in the plain Jyutping column
JYUTPING_PUNCT = {'，': ',', '。': '.', '！': '!', '？': '?', '；': ';', '：': ':', '、': ',',
                  '（': '(', '）': ')', '「': '"', '」': '"', '『': '"', '』': '"', '　': ' ',
                  '…': '...', '～': '~'}
CLOSING = set(',.!?;:)"')
OPENING = set('（「『(')

# the fixed text of the PDF for the students' language: English, Mandarin or
# Cantonese (whose blank column is for their own notes)
CHINESE = {'sections': {'char': '單字', 'word': '詞彙', 'sentence': '句子'},
           'first': {'char': '字', 'word': '詞彙'},
           'jyutping': '粵拼', 'tones': '聲調', 'high': '高', 'low': '低'}
TEXT = {
    'en': {'sections': {'char': 'Characters', 'word': 'Vocabulary', 'sentence': 'Sentences'},
           'first': {'char': 'Character', 'word': 'Word'},
           'jyutping': 'Jyutping', 'blank': 'English', 'tones': 'The six tones',
           'high': 'High', 'low': 'Low'},
    'zh': {**CHINESE, 'blank': '普通話'},
    'yue': {**CHINESE, 'blank': '筆記'},
}

# The six tones of the chart, after the chart the user supplied: the pitch levels
# (5 high to 1 low) at the start and end of the arrow, where the arrow starts and
# ends across the chart (cm), its colour, where the Chinese and the two-line
# English label go with their alignment on that point, and the names.
TONES = [
    (5, 5, 1.7, 4.1, (229, 72, 77), (2.9, 4.8, 'b'), (2.9, 4.75, 'b'), '陰平', 'High level'),
    (3, 5, 4.4, 6.0, (64, 182, 208), (5.3, 4.1, 'r'), (4.9, 4.1, 'r'), '陰上', 'High rising'),
    (3, 3, 6.3, 8.7, (176, 76, 222), (7.5, 2.8, 'b'), (7.5, 2.75, 'b'), '陰去', 'Mid level'),
    (2, 1, 8.9, 11.0, (238, 140, 52), (9.7, 1.0, 'r'), (10.0, 0.45, 't'), '陽平', 'Low falling'),
    (1, 3, 11.3, 12.9, (72, 178, 92), (12.2, 2.1, 'r'), (11.85, 2.1, 'r'), '陽上', 'Low rising'),
    (2, 2, 13.1, 15.3, (52, 120, 230), (14.2, 1.8, 'b'), (14.2, 1.75, 'b'), '陽去', 'Low level'),
]


def _level(n):
    """The height (cm) of pitch level n in the chart."""
    return 0.6 + (n - 1) * 1.0


def _tone_chart(text, english):
    """The \\tonechart macro: five dotted pitch levels and the six tones as
    coloured arrows, drawn in picture mode (pict2e and color only)."""
    out = [r'\newcommand\tonechart{{\centering\setlength{\unitlength}{1cm}\setlength{\fboxsep}{1.5pt}%',
           r'\begin{picture}(15.6,6.1)(0,-0.45)', r'\color[gray]{0.45}']
    for n in range(1, 6):
        y = _level(n)
        out.append(rf'\multiput(0.9,{y:.2f})(0.2,0){{73}}{{\circle*{{0.045}}}}')
        out.append(rf'\put(0.35,{y:.2f}){{\makebox(0,0){{\small {n}}}}}')
    out.append(rf'\put(0.35,{_level(5) + 0.6:.2f}){{\makebox(0,0){{\small {text["high"]}}}}}')
    out.append(rf'\put(0.35,{_level(1) - 0.6:.2f}){{\makebox(0,0){{\small {text["low"]}}}}}')
    out.append(r'\linethickness{1.6pt}')
    for k, (a, b, x1, x2, rgb, zh, en, name, gloss) in enumerate(TONES, 1):
        y1, y2 = _level(a), _level(b)
        colour = r'\color[RGB]{%d,%d,%d}' % rgb
        # pict2e takes any integer slope; the length is the horizontal extent
        out.append(rf'{{{colour}\put({x1:.2f},{y1:.2f}){{\vector({round((x2 - x1) * 100)},'
                   rf'{round((y2 - y1) * 100)}){{{x2 - x1:.2f}}}}}}}')
        lx, ly, align = en if english else zh
        label = (rf'\shortstack{{Tone {k} ({name})\\{gloss}}}' if english else f'{k} {name}')
        # on white, so that the dotted lines do not run through the text
        out.append(rf'\put({lx:.2f},{ly:.2f}){{\makebox(0,0)[{align}]'
                   rf'{{\colorbox{{white}}{{\color[gray]{{0.2}}\small {label}}}}}}}')
    out += [r'\end{picture}\par}}', '']
    return '\n'.join(out)


# per table (sentences have none): the alignment and size of the characters,
# and the widths of the three columns (characters, plain Jyutping, blank) within the 14.7 cm available
COLUMNS = {'char': (r'\centering', r'\Large', '2.6cm', '3.2cm', '8.8cm'),
           'word': (r'\centering', r'\Large', '4.6cm', '4.4cm', '5.6cm')}

PREAMBLE = r"""\documentclass[a4paper,11pt]{article}
\usepackage[margin=2.5cm]{geometry}
\usepackage[AutoFallBack=true]{xeCJK}
% xeCJK 3.9 stops its CJK class at U+3134F; the data has characters up to U+323AF
\xeCJKDeclareCharClass{CJK}{"2EBF0 -> "2EE5F, "31350 -> "323AF}
\setCJKmainfont{I.Ming-8.10.ttf}
\setCJKfallbackfamilyfont{\CJKrmdefault}{NotoSerifCJKhk-Regular.otf}
\usepackage{parskip}
\usepackage{setspace}
\usepackage{array}
\usepackage{longtable}
\usepackage{xjyutping}
\setstretch{1.5}
\pagestyle{plain}
\tracinglostchars=1
\renewcommand\arraystretch{1.6}
\xjyutpingsetup{ratio=0.5}
"""
# loaded only for the tone chart, so the bundle needs them only then
CHART_PACKAGES = r"""\usepackage{pict2e}
\usepackage{color}
"""


def _audience(lesson):
    return lesson.get('audience') if lesson.get('audience') in TEXT else 'en'


def escape(s):
    # control characters (a pasted soft line break is \x0b) stop XeTeX; they
    # become spaces, which take no syllable
    out = ''.join(TEX_ESCAPE.get(c, ' ' if unicodedata.category(c) == 'Cc' else c) for c in s)
    # << >> ,, are ligatures of the tex-text mapping (« » „)
    return re.sub(r'([<>,])(?=\1)', r'\1{}', out)


def _date(lesson):
    if lesson.get('date'):
        return lesson['date']
    d = datetime.date.today()
    if _audience(lesson) != 'en':
        return f'{d.year}年{d.month}月{d.day}日'
    return f'{d.day} {d:%B} {d.year}'


def _jyutping_cell(items):
    out, prev = '', None
    for it in items:
        if it['cjk']:
            tok, kind = it['r'], 'syl'
        else:
            tok = JYUTPING_PUNCT.get(it['c'], it['c'])
            kind = ('open' if it['c'] in OPENING else 'space' if tok.isspace()
                    else 'latin' if tok.isalnum() else 'punct')
        if (kind in ('syl', 'latin') and (prev in ('syl', 'latin') and 'syl' in (kind, prev)
                                          or out[-1:] in CLOSING and prev != 'open')) \
                or (kind == 'open' and out and not out.endswith(' ')):
            out += ' '
        out += tok
        prev = kind
    return ' '.join(out.split())


def _sentence(row, text, audience):
    """A sentence with its Jyutping above the characters and, under it, lines
    for the students' translation or notes: one line per 15 characters, at most
    three. Each sentence stays on one page."""
    syls = ' '.join(it['r'] for it in row['items'] if it['cjk'])
    lines = min(3, 1 + sum(it['cjk'] for it in row['items']) // 15)
    label = text['blank'] + (':' if audience == 'en' else '：')
    return '\n'.join(
        [r'\noindent\begin{minipage}{\linewidth}\raggedright',
         rf'{{\Large\xjyutping{{{escape(row["line"])}}}{{{syls}}}\par}}',
         rf'\vspace{{3mm}}\noindent{{\small {label}}}\enspace\hrulefill\par']
        + [r'\vspace{5mm}\noindent\hrulefill\par'] * (lines - 1)
        + [r'\end{minipage}\par\vspace{6mm}', ''])


def make_tex(lesson_json):
    lesson = json.loads(lesson_json)
    audience = _audience(lesson)
    text = TEXT[audience]
    chart = lesson.get('toneChart') is True
    groups = {'char': [], 'word': [], 'sentence': []}
    missing = []
    for n, row in enumerate(_rows(lesson), 1):
        if not row['cjk'] or row['duplicate']:
            continue
        for it in row['items']:
            if it['cjk'] and not (it['r'] and SYL.match(it['r'])):
                missing.append(f"line {n}: {it['c']}")
        groups[row['kind']].append(row)
    if missing:
        raise ValueError('These characters need a reading: ' + ', '.join(missing))
    body = []
    for kind in ('char', 'word'):
        if not groups[kind]:
            continue
        align, size, w1, w2, w3 = COLUMNS[kind]
        body.append(f"\\section*{{{text['sections'][kind]}}}\n"
                    f"\\begin{{longtable}}{{>{{{align}\\arraybackslash{size}}}m{{{w1}}}"
                    f"|>{{{align}\\arraybackslash\\setstretch{{1.1}}}}m{{{w2}}}|m{{{w3}}}}}\n"
                    f"\\normalsize {text['first'][kind]} & {text['jyutping']} & {text['blank']}"
                    "\\\\ \\hline\\hline\n\\endhead")
        for row in groups[kind]:
            syls = ' '.join(it['r'] for it in row['items'] if it['cjk'])
            body.append(f"\\xjyutping{{{escape(row['line'])}}}{{{syls}}} & "
                        f"{escape(_jyutping_cell(row['items']))} & \\\\")
        body.append('\\end{longtable}\n')
    if groups['sentence']:
        body.append(f"\\section*{{{text['sections']['sentence']}}}\n")
        body += [_sentence(row, text, audience) for row in groups['sentence']]
    preamble = PREAMBLE + (CHART_PACKAGES + _tone_chart(text, audience == 'en') if chart else '')
    if chart:
        body.insert(0, f"\\section*{{{text['tones']}}}\n\\tonechart\n")
    return (preamble
            + f"\\title{{{escape(lesson.get('title', ''))}}}\n"
            + f"\\author{{{escape(lesson.get('author', ''))}}}\n"
            + f"\\date{{{escape(_date(lesson))}}}\n"
            + '\\begin{document}\n\\maketitle\n\n' + '\n'.join(body) + '\\end{document}\n')
