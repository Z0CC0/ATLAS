---
name: atlas-ship
description: >
  Gets finished work out: a pull request, a container image, a pipeline, a deploy, with the
  checks before and the way back written down. Angles by the request: "PR", "pull request";
  "deploy", "release", "rollout"; "docker", "compose", "container"; "kubernetes", "helm"; "CI",
  "pipeline", "GitHub Actions"; "branch", "rebase", "tag"; "monitoring", "dashboard", "alerts"; "installer".
  Never pushes, publishes or deploys without a yes. Use for "atlas ship", "open a PR", "get
  this deployed", "set up CI" — in any language.
---

Shipping is the part of the work other people and other machines see. Every step here that
leaves the machine is shown first and done after a yes.

## What to read

Everything below lives in the `ship/` folder beside this file. One file per angle:

"PR", "pull request", "merge request" → `pr.md`
"deploy", "release", "rollout", "go live", "rollback" → `deploy.md`
"docker", "Dockerfile", "compose", "container", "image" → `container.md`
"kubernetes", "k8s", "helm", "manifest", "pod" → `kubernetes.md`
"CI", "pipeline", "workflow", "GitHub Actions", "GitLab CI" → `pipeline.md`
"branch", "rebase", "merge", "tag", "undo a commit", "git" → `git.md`
"monitoring", "dashboard", "alerts", "metrics", "what should we watch" → `observe.md`
"installer", "setup.exe", "package the app for Windows", "Nuitka", "Inno Setup" → `installer.md`
Nothing named, "ship this": `pr.md`, after `atlas-verify` says `READY`.

## What needs a yes, every time

`git push`, a force push most of all; creating, merging or closing a pull request; pushing a
tag or an image; applying to a cluster; running a deploy, a migration, a rollback; changing
branch protection, secrets or permissions; anything that sends a notification to people.
The yes covers the action shown, once. Shown means: the exact command, the target, and what
it changes.

## With the other skills

Before a PR or a deploy: `atlas-verify`, and its `release` angle before going live. The
commit message: `atlas-commit`. A second pair of eyes: `atlas-review`.

## Form

The active compression level governs the prose. Pull request titles and bodies, commit
messages, runbooks, comments in pipeline files: written for other people, whole sentences,
uncompressed, in the language the project uses.
