#!/bin/bash
# Fast U-shape iteration loop: bundle the dev render harness with esbuild, run it
# to emit test-output/dev-*.svg, then rasterise each to PNG for inspection.
set -e
cd "$(dirname "$0")"

ESBUILD=../node_modules/.bin/esbuild
DENSITY="${1:-100}"

"$ESBUILD" src/io/svg/__tests__/_uShapeRender.dev.ts \
  --bundle --platform=node --format=cjs \
  --outfile=/tmp/u-render.cjs --log-level=warning

node /tmp/u-render.cjs

for f in test-output/dev-*.svg; do
  [ -e "$f" ] || continue
  convert -density "$DENSITY" -background white "$f" "${f%.svg}.png" 2>/dev/null \
    && echo "png ${f%.svg}.png"
done
echo "OK"
