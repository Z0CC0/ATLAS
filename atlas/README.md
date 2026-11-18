# atlas

The plugin folder of the default build of ATLAS, a Claude Code plugin.

**What it does.** Four dials for how the assistant talks to you: compression (`atlas low`, `atlas high`), rigour (`atlas ask`: questions before building when the goal is unclear), `atlas check` and `atlas silent`. Two subagents keep web searches and pages out of your conversation.

**How to use it.** Type a dial as a message, for example `atlas low`; `atlas off` turns everything off, `atlas help` prints the card, `atlas doctor` checks the install. It ships off: nothing changes until you type a dial.

**Setup.** `node` on the PATH and Claude Code 2.1.139 or later. No dependencies, no build step, no telemetry.

**Its hooks.** Command hooks at session start and at each prompt bring the rules of the dials that are on. One hooks module (early access, loaded only with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`) hooks `session.compact`: with `atlas prune on` a compaction keeps your words and drops only tool results the conversation made useless; otherwise Claude Code's own summary runs untouched. It also redraws the line of the dials under the prompt.

Everything else, with the measurements, is in the [README of this repository](../README.md).
