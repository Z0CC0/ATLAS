---
name: atlas-publish
description: >
  Prepares a private project to be made public, on a copy and never on the original: takes
  out secrets, personal data and internal references, checks the copy with fresh eyes, adds
  what a stranger needs to run it, and proves it works from a clean clone. Creates no
  repository, pushes nothing and makes nothing public without a yes. Use for "atlas publish",
  "open source this", "make this repo public", "is it safe to publish", "strip the secrets"
  — in any language.
---

Making something public cannot be taken back: a secret that was visible for a minute has
leaked. So the work happens on a copy, the check is done by eyes that did not do the
cleaning, and the last step waits for the user.

## What to read

Everything below lives in the `publish/` folder beside this file.

1. `publish/method.md`, always: the copy, the questions asked up front, the order, the
   history, the gate, the report.
2. By the stage, or by the words of the request:
   "strip", "clean", "remove the secrets", and the first stage of a full run → `strip.md`
   "is it safe", "check", "scan", "audit", and the second stage → `scan.md`
   "README", "licence", "package it", "make it runnable", and the third stage → `package.md`

"Open source this" with nothing else: the full run, all three in that order.
"Is it safe to publish" on a repository as it stands: `scan.md` alone, read-only, on the
project itself, history included.

## What needs a yes, every time

Creating the remote repository; the first push; changing visibility to public; publishing a
package to a registry. Each shown with its exact command and target. The yes covers that
action, once. Nothing here is done on the strength of an earlier yes.

## With the other skills

The scan is given to a fresh subagent when there is one, with the path and nothing else.
The clean-clone run uses `atlas-runner`. The README is checked against the code by
`atlas-docs`. The first commit message: `atlas-commit`.

## Form

The active compression level governs the prose. It never overrides the report and verdict
in `method.md` and `scan.md`. README, licence and every file in the copy are for strangers:
whole sentences, uncompressed, in English unless the user says otherwise.
