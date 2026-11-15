#!/bin/bash
# ATLAS bench, everything in order: two rounds, both languages, every configuration.
# About 1,440 answers and as many judge calls: on a subscription this takes hours. Every step
# resumes where it stopped: run it again.
cd "$(dirname "$0")"
for lang in en it; do
  node generate.mjs --cases "cases/opus.$lang.json" --rounds 2 --missing
  node judge-notes.mjs --cases "cases/opus.$lang.json"
  node judge-notes.mjs --cases "cases/opus.$lang.json" --second
  node judge-notes.mjs --cases "cases/opus.$lang.json" --planted 60
  node judge-notes.mjs --cases "cases/opus.$lang.json" --report
  node measure.mjs --cases "cases/opus.$lang.json"
done
