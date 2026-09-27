#!/bin/bash
# Second pass of the Opus bench, 2026-09-26. Two kinds of rows are made again:
#  - the round-1 English rows with `check` on, generated before the split session-start
#    hook (0.1.4): Claude Code had handed the model a 2 KB preview of the rules;
#  - every `adhd` row, both languages: generate.mjs split the skill's frontmatter on LF
#    only, the file is CRLF, and the system prompt appended was empty.
# The answers and their verdicts go, and generate.mjs --missing makes them again.
cd "$(dirname "$0")"
for cfg in low-check low-ask-check high-check high-ask-check; do
  rm -f generated/opus.en/*."$cfg".1.json generated/opus.en/*."$cfg".1.txt
done
rm -f generated/opus.en/*.adhd.*.json generated/opus.en/*.adhd.*.txt generated/opus.it/*.adhd.*.json generated/opus.it/*.adhd.*.txt
for lang in en it; do
  node -e '
const fs = require("fs"); const f = "verdicts.opus." + process.argv[1] + ".json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8")); let n = 0;
  for (const k of Object.keys(v)) if (/\.(low-check|low-ask-check|high-check|high-ask-check)\.1\.txt::/.test(k) && process.argv[1] === "en" || /\.adhd\.\d+\.txt::/.test(k)) { delete v[k]; n++; }
  fs.writeFileSync(f, JSON.stringify(v, null, 2)); console.log(f, "verdicts pruned:", n);
}' "$lang"
done
for lang in en it; do
  node generate.mjs --cases "cases/opus.$lang.json" --rounds 2 --missing
  node judge.mjs --cases "cases/opus.$lang.json"
done
echo OPUS2-FINITO
