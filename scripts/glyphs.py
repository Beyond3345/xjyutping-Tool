"""Writes py/glyphs.txt, the code point ranges that I.Ming or Noto Serif CJK HK
can print, which app.py uses to flag characters the PDF would leave blank.
Run again only when a font changes: python3 scripts/glyphs.py I.Ming.ttf Noto.otf
(needs fontTools)."""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

cps = sorted({cp for f in sys.argv[1:] for cp in TTFont(f, fontNumber=0).getBestCmap()})
ranges, start = [], cps[0]
for a, b in zip(cps, cps[1:] + [None]):
    if b != a + 1:
        ranges.append(f'{start:X}' if start == a else f'{start:X}-{a:X}')
        start = b
Path(__file__).resolve().parents[1].joinpath('py', 'glyphs.txt').write_text('\n'.join(ranges) + '\n')
print(len(cps), 'code points in', len(ranges), 'ranges')
