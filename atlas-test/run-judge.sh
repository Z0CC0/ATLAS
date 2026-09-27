#!/bin/bash
cd "$(dirname "$0")"
node judge.mjs --cases cases/opus.it.json
node judge.mjs --cases cases/opus.en.json
echo JUDGE-FINITO
