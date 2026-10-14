#!/usr/bin/env bash
# Compiles the fixture lesson for the three audiences with the bundled Tectonic and
# texbundle, from an empty cache (and without network where sandbox-exec exists),
# then once more with each other font of py/fonts.json (whose missing characters
# come from the other Chinese fonts), and fails on a TeX error, a missing log,
# a syllable count mismatch or a character that no font prints.
#   scripts/compile-check.sh                 also renders PNGs with gs for a visual check
#   scripts/compile-check.sh --engine-only   engine checks only (CI)
# Needs the output of scripts/vendor.mjs and Python; XJYUTPING_PY points at xjyutping-py.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
PY_SRC=${XJYUTPING_PY:-../xjyutping-py}/src
PYTHON=${PYTHON:-$(command -v python3 || command -v python)}
BIN=$(ls src-tauri/binaries/tectonic-"$(rustc --print host-tuple)"* | head -1)
OUT=${OUT:-$ROOT/.downloads/check}
rm -rf "$OUT" && mkdir -p "$OUT/cache"

# Windows paths for the native programs when run from Git Bash
native() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
NET=()
if command -v sandbox-exec >/dev/null; then NET=(sandbox-exec -p '(version 1)(allow default)(deny network*)'); fi

# jobs: the three audiences with the default fonts, then a job per other font
JOBS=$("$PYTHON" -c "
import json
fonts = json.load(open('py/fonts.json', encoding='utf8'))
print(' '.join(['en', 'zh', 'yue'] + [f['kind'] + 'Font=' + f['id'] for f in fonts if not f.get('default') and not f.get('system')]))" | tr -d '\r')

status=0
for audience in $JOBS; do
  "$PYTHON" -c "
import json, sys
sys.path[:0] = [sys.argv[3], 'py']
import app
lesson = json.load(open('tests/fixture-lesson.json', encoding='utf8'))
job = sys.argv[1]
if '=' in job:
    key, font = job.split('=')
    lesson[key] = font
else:
    lesson['audience'] = job
open(sys.argv[2], 'w', encoding='utf8').write(app.make_tex(json.dumps(lesson)))
" "$audience" "$OUT/$audience.tex" "$PY_SRC"
  # as the app runs it: from the resource folder, with the bundle given relatively
  (cd src-tauri/resources && TECTONIC_CACHE_DIR="$(native "$OUT/cache")" ${NET[@]+"${NET[@]}"} "$ROOT/$BIN" \
    -b texbundle --untrusted --chatter minimal --keep-logs "$(native "$OUT/$audience.tex")")
  log="$OUT/$audience.log"
  if [ ! -s "$log" ]; then echo "FAIL $audience: no log"; status=1; continue; fi
  if grep -q '^!' "$log"; then echo "FAIL $audience: TeX error"; grep -A3 '^!' "$log"; status=1; fi
  # xjyutping's count-mismatch warning: "`...' has n character(s) but `...' has m syllable(s)."
  if grep -q 'syllable(s)' "$log"; then echo "FAIL $audience: syllable count"; grep -n -B1 'syllable(s)' "$log"; status=1; fi
  # every character of the fixture is in one of the Chinese fonts
  if grep -q 'Missing character' "$log"; then echo "FAIL $audience: characters without a glyph:"; grep 'Missing character' "$log" | sort -u; status=1; fi
  echo "ok   $audience: $(grep -c . "$log") log lines, $(wc -c < "$OUT/$audience.pdf" | tr -d ' ') bytes of PDF"
done

if [ "${1:-}" != "--engine-only" ] && command -v gs >/dev/null; then
  for audience in $JOBS; do
    gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m -r110 -sOutputFile="$OUT/$audience-%d.png" "$OUT/$audience.pdf"
  done
  echo "PNGs in $OUT"
fi
exit $status
