#!/bin/bash
# The full bench on the current CLI model: every configuration, two rounds, both languages.
cd "$(dirname "$0")"
for lang in en it; do
  node generate.mjs --cases "cases/opus.$lang.json" --rounds 2 --missing
  node judge.mjs --cases "cases/opus.$lang.json"
done
echo OPUS-FINITO
