---
name: atlas-organize
description: >
  Tidy a local folder, any kind of file: select by content or by criterion, copy, move, group into
  subfolders, or set aside what is not wanted. Four levels, from a plan that touches nothing to a
  move with everything else set aside. Every run leaves a manifest and can be undone.
  Use when the user says "atlas organize", "/atlas-organize", "tidy this folder", "clear out my
  downloads", "keep only the 2025 invoices", "move these into a new folder", "clear some space in
  here" — or the same in any other language, since the request is recognised by what it asks for,
  not by the words it uses. Any ask to sort, filter, archive or separate files in a folder.
---

Tidy the folder. **Describe what you would do, then do it.**

Whoever asks for a tidy-up does not have the criterion you understood, almost never on the first
try. And this is the one kind of work where being wrong is not fixed by writing another answer: a
file moved out of a folder the user had stopped looking at is a lost file even though it
technically still exists.

## The four levels

The level is chosen with the user, never guessed. If they have not said, start at **1** and offer
the next one.

| level | what it does | what happens to the originals |
|---|---|---|
| **1 · plan** | says what it would do, then stops | nothing, not even a folder created |
| **2 · copy** | copies the selected files somewhere new | they stay where they are |
| **3 · move** | moves the selected files | they leave the source folder |
| **4 · move and set aside** | moves the selected, puts the rest away | the rest goes to `_set-aside/` or the Recycle Bin |

**Level 4 deletes nothing.** By default the rest goes to a `_set-aside/` folder inside the source,
which the user can look through and empty once convinced. The system Recycle Bin is used only on
request, and it is worth saying that files there are recovered by hand, not with `--undo`.

**Permanent deletion is not a level and is not to be added.** Whoever picks the files is a model
reading or looking at them, and it gets things wrong: "keep only the invoices" followed by
deletion means the invoice that arrived as a crooked scan never comes back. If the user insists,
explain that `_set-aside/` gives them the same result — a clean folder — and that deleting it
themselves after a look costs one click.

## Two ways to tidy

**Filter** — a criterion splits the files into in and out. "Keep the 2025 invoices", "which of
these scripts touch the database", "the photos with a screen in them".

**Group** — nobody is left out, only where things live changes. By type, by date, by project, by
whatever the user calls "style". "Tidy my desktop" is almost always this one.

Ask which, when the request reads both ways. "Sort this folder out" is ambiguous and the
difference is enormous.

## How to look inside a file, by type

A criterion about content only applies to files that can actually be read. How they are read
changes completely, and taking the wrong route here produces a confident, wrong plan.

**Images** — look at them. In batches, never three hundred at once: open the first twenty, check
the criterion splits them as expected, then carry on.

**Native PDFs** — read the text. But a scanned PDF has no text: it is an image inside a container.
If extraction comes back empty or nearly so, that is what it is, and it must be looked at as an
image.

**Text, code, markdown, JSON, logs** — read them, or better, search them: a `grep` for the term
that decides costs a fraction of a read and answers the same question.

**CSV and spreadsheets** — a header and a few rows are enough to tell what a file is. To count
something inside, run a command over the file, not the file into a prompt.

**Office documents** — `docx`, `xlsx`, `pptx` are archives with XML inside: the text can be
extracted. If a skill for that format is loaded in the session, that is the better route.

**Archives** — `zip`, `7z`, `tar`: list what they hold without extracting. The criterion almost
always concerns the listing, not the files inside.

**Video and audio cannot be watched or listened to.** There is no way to know what a video shows
by opening it. The routes, in order:

- name, date, size, and where it sits in the folder. Often that is the real criterion anyway
- duration, resolution, codec, capture date via `ffprobe`, if it is installed
- one frame pulled with `ffmpeg` and looked at as an image — this answers "screencast or camera
  footage", never "does my car appear at some point"

If none of the three can decide the criterion, **say so and stop**: offer a criterion the metadata
can settle, rather than guessing from the filename.

**Formats you cannot read** — executables, binaries, proprietary project files: name and metadata,
and say that is all it was.

**A name is not content.** `invoice-2025.pdf` may be a quote; `IMG_4471.jpg` says nothing. When
the criterion is about content and the decision came from the name, that file is flagged
separately: **always say which files were judged by looking inside and which by name, date or
size.** Those are two different levels of confidence and whoever reads the plan must be able to
tell them apart.

## How to work

**1. Look before proposing.** Count the files, the types, the dates, the sizes. If the criterion
is about content, open some by the route that fits their type, as above. A plan written without
looking describes an imaginary folder.

**2. Say the criterion back in your own words, and wait.** "I keep the PDFs that are real
invoices; quotes and payment receipts go aside." This is where misunderstandings surface, while
they still cost one line.

On the edge cases state the rule instead of deciding in silence: whether a credit note counts as
an invoice, whether a contract signed in 2025 but dated 2024 belongs to 2025, what happens to a
file the criterion does not cover at all.

**3. Write the plan.** JSON, one action per file:

```json
{
  "source": "C:/Users/you/Downloads",
  "criterion": "keep the 2025 invoices, the rest aside",
  "actions": [
    { "file": "acme-2025-03.pdf", "do": "move", "to": "C:/Users/you/Documents/invoices 2025" },
    { "file": "installer.exe", "do": "aside" }
  ]
}
```

`do`: `copy`, `move`, `aside` (into `_set-aside/`), `bin` (system Recycle Bin).

**The plan is always written in English.** You write it, not the user, so it never follows the
language of the conversation — only what you say back to them does.

**4. Dry run, always.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/organize.mjs" --plan plan.json
```

It prints the counts, three names per group, and any file in the plan that is not in the folder.
**Show that to the user**, not a summary of your own: counts do not reveal a wrong criterion,
names do.

**5. Run it only after a yes.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/organize.mjs" --plan plan.json --apply
```

It leaves a manifest. Give the user the undo command every time, including when everything went
well:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/organize.mjs" --undo manifest-N-files.json
```

## What the tool guarantees on its own

Nothing is ever overwritten: a name collision becomes `name (2).jpg`. It will not work on the root
of a drive, on the whole user folder, or inside `Windows`, `Program Files`, `ProgramData` or
`AppData` — it refuses and says which rule fired. Every run writes the manifest **before**
reporting that it finished.

What it does not guarantee, and the user needs to hear when it matters: files sent to the system
Recycle Bin are recovered from the Recycle Bin, not with `--undo`.

## Rules that hold at every level

**On a large folder, a taste first.** Above two or three hundred files, apply to twenty, have them
looked at, then the rest. A wrong criterion on twenty files is an inconvenience.

**Never tidy a working folder without asking.** A repository, a project directory, anywhere with
`.git`, `node_modules` or `package.json` in it: moving files there breaks things that are not
visible. Say so and stop.

**Synced folders behave differently.** OneDrive, Dropbox, Google Drive: a move propagates
everywhere, and a "free up space" file may not even be on the disk. If the path is inside one, say
so first.

**Do not invent metadata.** A file's date is the filesystem's, not the one the name suggests. If
the criterion is a date and the two disagree, ask which one counts.

**Do not tidy more than was asked.** A named folder is a folder, not a tree: go into subfolders
only when the user says to.

## At the end

What moved and where, how many files, what fell outside the criterion, and the undo command. If
anything was skipped — a file open in another program, a permission denied — name it, never as a
count: a file silently left behind is discovered months later.

What this writes leaves the conversation, so it is written normally at every level — the dials do
not reach it. Only the report back in chat follows the active level.
