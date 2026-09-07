#!/bin/bash
# ATLAS bench — everything, in order. Two rounds, both languages, every configuration.
# About 1,400 calls to the Claude CLI plus a few hundred short judge calls: on a
# subscription this takes several hours. Every step is resumable: run it again and
# it picks up where it stopped.
cd "$(dirname "$0")"
for lang in en it; do
  node generate.mjs --cases "cases/compression.$lang.json" --rounds 2 --missing
  node judge.mjs --cases "cases/compression.$lang.json"
  node measure.mjs --cases "cases/compression.$lang.json"
done
