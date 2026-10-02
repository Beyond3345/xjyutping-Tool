"""Rebuilds tex/tl2024/, the TeX Live 2024 files the app's template needs.

The fixture lesson is compiled for both audiences by Tectonic against the
official TeX Live 2024 bundle (fetched by range requests, so only the files
used are downloaded), and the files Tectonic cached are copied into one flat
folder. scripts/vendor.mjs adds xjyutping.sty, its data and the fonts. Run it
after any change to the template in py/app.py, then run scripts/compile-check.sh:

    PYTHONPATH=../xjyutping-py/src:py python3 scripts/harvest_bundle.py

It needs the network and the Tectonic binary that vendor.mjs unpacks into
.downloads/ (run `npm run build` or `node scripts/vendor.mjs` once first).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import app

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = 'https://bebopbamf-tex.syd1.cdn.digitaloceanspaces.com/texlive2024-0312.ttb'
# expected_hash of bundles/bundles/texlive2024-0312/bundle.toml in the Tectonic repository
BUNDLE_HASH = '8fae742a1d9453fc3abfe7c6971363696f611ade1266c17788ccb5c18ffd1312'
OUT = ROOT / 'tex' / 'tl2024'
RES = ROOT / 'src-tauri' / 'resources' / 'texbundle'


def tectonic():
    found = sorted(ROOT.glob('.downloads/tectonic-*/tectonic'))
    if not found:
        sys.exit('no Tectonic in .downloads/; run node scripts/vendor.mjs first')
    return found[0]


def main():
    lesson = json.loads((ROOT / 'tests' / 'fixture-lesson.json').read_text(encoding='utf8'))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        cache = tmp / 'cache'
        job = tmp / 'job'
        job.mkdir()
        # the package, its data and the fonts sit next to the document, so they are
        # read from there and stay out of the harvested files
        for f in ('xjyutping.sty', 'xjyutping-chars.def', 'xjyutping-words.def',
                  'I.Ming-8.10.ttf', 'NotoSerifCJKhk-Regular.otf'):
            shutil.copy(RES / f, job / f)
        for audience in ('en', 'zh'):
            lesson['audience'] = audience
            (job / f'{audience}.tex').write_text(app.make_tex(json.dumps(lesson)), encoding='utf8')
            # Tectonic 0.17.0 panics (ttb_net.rs:185) when a cached index meets an
            # uncached file in a new process, so drop the index before each run
            for index in cache.glob('bundles/data/*.index'):
                index.unlink()
            subprocess.run([str(tectonic()), '-b', BUNDLE, '--untrusted', '--keep-logs', f'{audience}.tex'],
                           cwd=job, env={**os.environ, 'TECTONIC_CACHE_DIR': str(cache)}, check=True)
        hashes = list(cache.glob('bundles/hashes/*'))
        if [h.read_text().split()[0] for h in hashes if not h.name.endswith('.lock')] != [BUNDLE_HASH]:
            sys.exit(f'unexpected bundle hash in {hashes}')
        data = cache / 'bundles' / 'data' / BUNDLE_HASH
        shutil.rmtree(OUT, ignore_errors=True)
        OUT.mkdir(parents=True)
        seen = {}
        for path in sorted(p for p in data.rglob('*') if p.is_file()):
            if path.name in seen:
                print(f'warning: {path.name} at {seen[path.name]} and {path}; keeping the first')
                continue
            seen[path.name] = path
            shutil.copy(path, OUT / path.name)
    if not (OUT / 'tectonic-format-latex.tex').exists():
        sys.exit('tectonic-format-latex.tex is missing from the harvest')
    size = sum(p.stat().st_size for p in OUT.iterdir())
    print(f'{len(seen)} files, {size / 1e6:.1f} MB in {OUT}')


if __name__ == '__main__':
    main()
