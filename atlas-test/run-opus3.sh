#!/bin/bash
# Third launch of the Opus bench, 2026-09-26 evening. The first run finished English and
# lost the whole Italian pass to the subscription's usage limit (720 FAILED, no files).
# This one, in order:
#  1. drops the English rows that were measured wrong and their verdicts:
#     - round-1 rows with `check` on, generated before the split session-start hook
#       (Claude Code handed the model a 2 KB preview of the rules instead of the rules);
#     - every `adhd` row: generate.mjs split the skill's frontmatter on LF, the file is
#       CRLF, and the system prompt appended was empty;
#  2. generates whatever is missing, English then Italian, and judges each.
# Resumable: run it again and it picks up where it stopped.
cd "$(dirname "$0")"
for cfg in low-check low-ask-check high-check high-ask-check; do
  rm -f generated/opus.en/*."$cfg".1.json generated/opus.en/*."$cfg".1.txt
done
rm -f generated/opus.en/*.adhd.*.json generated/opus.en/*.adhd.*.txt
node -e '
const fs = require("fs"); const f = "verdicts.opus.en.json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8")); let n = 0;
  for (const k of Object.keys(v)) if (/\.(low-check|low-ask-check|high-check|high-ask-check)\.1\.txt::/.test(k) || /\.adhd\.\d+\.txt::/.test(k)) { delete v[k]; n++; }
  fs.writeFileSync(f, JSON.stringify(v, null, 2)); console.log(f, "verdicts pruned:", n);
}'
for lang in en it; do
  node generate.mjs --cases "cases/opus.$lang.json" --rounds 2 --missing
  node judge.mjs --cases "cases/opus.$lang.json"
done
echo OPUS3-FINITO
