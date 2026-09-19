#!/bin/bash
# Visual iteration loop for the U-shape exporter (issue #2).
#
# Bundles the dev render harnesses with esbuild, runs them to emit
# test-output/dev-*.svg (fixtures) and test-output/ped-*.svg (every test PED
# file and in-app example, with a sanity report on stdout), then screenshots
# each SVG in headless Chromium.
# Chromium is used on purpose: ImageMagick's built-in SVG renderer gets arcs
# and rotated groups wrong, which makes a correct layout look broken.
#
#   test-output/dev-NAME.full.png   1:1 pixels, crop this to look at detail
#   test-output/dev-NAME.png        whole figure, shrunk to fit MAXPX
#
# Usage: ./render-u.sh [MAXPX, default 1800] [name filter, e.g. synth or ped-]
set -e
cd "$(dirname "$0")"

ESBUILD=../node_modules/.bin/esbuild
MAXPX="${1:-1800}"
FILTER="${2:-}"
CHROME="${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)}"
[ -n "$CHROME" ] || { echo "No Chromium/Chrome found. Set CHROME=/path/to/browser"; exit 1; }
mkdir -p test-output

"$ESBUILD" src/io/svg/__tests__/_uShapeRender.dev.ts \
  --bundle --platform=node --format=cjs \
  --outfile=test-output/_u-render.cjs --log-level=warning

node test-output/_u-render.cjs

"$ESBUILD" src/io/svg/__tests__/_uShapePeds.dev.ts \
  --bundle --platform=node --format=cjs \
  --outfile=test-output/_u-peds.cjs --log-level=warning

node test-output/_u-peds.cjs

for f in test-output/*"$FILTER"*.svg; do
  [ -e "$f" ] || continue
  w=$(grep -o 'width="[0-9]*"' "$f" | head -1 | grep -o '[0-9]*')
  h=$(grep -o 'height="[0-9]*"' "$f" | head -1 | grep -o '[0-9]*')
  full="${f%.svg}.full.png"
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --window-size="$w,$h" --screenshot="$PWD/$full" "file://$PWD/$f" >/dev/null 2>&1
  convert "$full" -resize "${MAXPX}x${MAXPX}>" "${f%.svg}.png"
  echo "png ${f%.svg}.png (${w}x${h})"
done
echo "OK"
