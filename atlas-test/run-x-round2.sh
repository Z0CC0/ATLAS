#!/bin/bash
cd "$(dirname "$0")"
for lang in en it; do
  for cfg in atlasmin-high minx-high none; do
    node generate.mjs --cases "cases/sameday.$lang.json" --only "$cfg" --rounds 2 --missing
  done
done
node judge.mjs --cases cases/sameday.en.json
node judge.mjs --cases cases/sameday.it.json
echo X2ROUND-FINITO
