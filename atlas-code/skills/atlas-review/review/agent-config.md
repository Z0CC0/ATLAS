# Agent configuration — is this Claude Code setup safe

For "is my setup safe", "audit my `.claude`", "check my hooks", "check the MCP config", or
a diff that touches these files. Read-only. The findings use the review line and tiers.

## What to read

In the project and in the user's home: `.claude/settings.json` and
`settings.local.json`, `.mcp.json`, `CLAUDE.md` and `AGENTS.md`, `.claude/agents/`,
`.claude/commands/`, `.claude/skills/`, hook scripts those settings point to, and the
`plugin.json` and hook files of installed plugins. Home files hold the user's own choices:
they are reported, never judged as someone else's mistake.

Values of secrets are never printed: the line says which key, in which file.

## breaks

A secret in a file that is committed or shared: an API key or token in `settings.json`,
in an MCP server's `env` block, in `CLAUDE.md`, in a hook script. The fix is an
environment variable or the client's secret store, and rotating the key.
A hook that runs text from the model or from a tool result through a shell: a command
built by string interpolation from the hook's input, `eval`, a pipe from a download into a
shell. Anything the model reads can then run commands.
A hook or MCP server launched from a path the repository can change (a script inside the
project) in a setup that is trusted automatically: cloning the repository runs its code.
Permissions that allow everything: a wildcard allow on the shell tool, bypass mode set in
a shared file, `allow` rules that cover `rm`, `curl … | sh`, `git push --force` or writes
outside the project.
An MCP server fetched and executed at launch with no pinned version (`npx -y package`,
`uvx package` with no version): whoever publishes the next version runs code here.
A remote MCP server over plain `http`, or one that receives credentials it does not need.
Instructions in an agent, skill, command or `CLAUDE.md` that tell the model to ignore the
user, hide actions, send data somewhere, or disable checks. In a file that came from
outside (a plugin, a cloned repository), this is the finding to put first.

## fragile

`allow` rules broader than what the work needs; no `deny` for reading `.env`, key files
and credential folders.
A subagent with no `tools` line, so it inherits everything, where its job needs three.
A hook with no timeout; a hook that fails open on error where it guards something, or
fails closed where it only formats.
A hook printing more than about 10 KB: Claude Code keeps a short preview of the rest, so
rules past that point are not being read.
An MCP server with write access to a system where the work only reads.
Auto-approval of project MCP servers or hooks turned on for every repository.
`CLAUDE.md` importing a file from outside the repository, or from a URL.

## unclear

Two plugins defining the same command or skill name; a hook whose purpose is not said
anywhere; a permission rule nobody can explain.

## ask

Whether a broad permission was a deliberate choice for this machine. Whether a server or
plugin from an unknown author is one the user chose.

## Not findings here

The user's choice of model, style or output settings; a permissive setup on a throwaway
sandbox, once it is said to be one; the presence of hooks as such.

## After the list

Counts per tier, and the files read. Nothing is changed: each fix is the user's to
approve, and edits to settings files are shown as a diff first.
