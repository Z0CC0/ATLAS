#!/bin/bash
cd "$(dirname "$0")"
for lang in en it; do
  for cfg in minx-low minx-high; do
    node generate.mjs --cases "cases/compression.$lang.json" --only "$cfg" --rounds 2 --missing
  done
done
node judge.mjs --cases cases/compression.en.json
node judge.mjs --cases cases/compression.it.json
echo MINX-FINITO
