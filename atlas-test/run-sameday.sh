#!/bin/bash
# Same day, same model, same window: the baselines and the experiments together.
cd "$(dirname "$0")"
for lang in en it; do
  for cfg in none atlasmin-high caveman-ultra minx2-high minx-high; do
    node generate.mjs --cases "cases/sameday.$lang.json" --only "$cfg" --rounds 1 --missing
  done
done
node judge.mjs --cases cases/sameday.en.json
node judge.mjs --cases cases/sameday.it.json
echo SAMEDAY-FINITO
