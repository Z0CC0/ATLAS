#!/bin/bash
cd "$(dirname "$0")"
for lang in en it; do
  node generate.mjs --cases "cases/sameday.$lang.json" --only caveman-ultra --rounds 1 --missing
done
node judge.mjs --cases cases/sameday.en.json
node judge.mjs --cases cases/sameday.it.json
echo CAV-FINITO
