"""Writes py/glyphs/<id>.txt for every font of py/fonts.json: the code point
ranges the font can print, which app.py uses to flag characters the chosen
font lacks. Run it after adding or changing a font, once scripts/vendor.mjs
has put the fonts into src-tauri/resources/texbundle/ (needs fontTools):
python3 scripts/glyphs.py"""
import json
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'py' / 'glyphs'
OUT.mkdir(exist_ok=True)
for font in json.loads((ROOT / 'py' / 'fonts.json').read_text(encoding='utf8')):
    cps = sorted(TTFont(ROOT / 'src-tauri' / 'resources' / 'texbundle' / font['file']).getBestCmap())
    ranges, start = [], cps[0]
    for a, b in zip(cps, cps[1:] + [None]):
        if b != a + 1:
            ranges.append(f'{start:X}' if start == a else f'{start:X}-{a:X}')
            start = b
    (OUT / f"{font['id']}.txt").write_text('\n'.join(ranges) + '\n')
    print(f"{font['id']}: {len(cps)} code points in {len(ranges)} ranges")
