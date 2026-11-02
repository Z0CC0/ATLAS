# Writing the spec

Eight sections, each short; a section that would be empty says why it is empty rather than
being removed, so the reader knows it was considered. The whole document fits on two screens
for a feature and five for a product; longer means the scope is more than one spec.

## The sections

1. **Problem.** One paragraph: who has it, when it happens, what it costs them now. Written from
   the person's side, not the system's. If the problem cannot be stated without naming the
   solution, it is not understood yet: stop and ask.
2. **Who.** The one or two kinds of people this is for, by what they do and know, not by a
   persona name. Who it is explicitly not for, when that decides a trade-off.
3. **Done looks like.** Three to seven statements of what the person can do afterwards that
   they cannot do now, each one checkable by someone who was not in the room. This section
   is the contract; everything else serves it.
4. **Scope.** What is in, as a list of behaviours; what is out, as a list with the reason for
   each (later, never, someone else's). The "out" list is where most disagreements are
   avoided: write it even when it seems obvious.
5. **Constraints.** What is fixed before design starts: platform, data that must not leave
   the machine, compatibility with what exists, performance figures the person will feel, the
   rule books that apply. Each with its source (a person, a document, a measurement).
6. **Behaviour.** The main path as a short numbered walk-through from the person's side, then
   the edge cases that matter: empty, too much, interrupted, wrong input, offline, second
   time. Each edge case says what the person sees, not what the code does.
7. **Acceptance.** For each statement of "done looks like", how it will be verified: a test
   that exists or will, a measurement with its threshold, a demonstration with named steps.
   "Works correctly" is not acceptance.
8. **Open questions.** Numbered, each with who can answer it and what changes depending on
   the answer. A question nobody can answer becomes an assumption, stated as such in the
   section it affects, with the date.

## Rules of writing

A requirement is a sentence with "must" and a subject that is the system or the person, never
"it should be possible to". One requirement per sentence. Numbers where a number exists
(how many, how long, how big); "fast" and "many" are questions, not requirements. Terms that
the project already uses, with their meaning fixed in the first sentence that uses them.
No technology named unless it is a constraint from section 5; "the data survives a restart"
rather than "stored in SQLite". No UI described by widgets; what the person does and sees.

## From a conversation

When the spec is written from a discussion, every requirement that came from the person is
kept in their words where the words are precise, and their words are replaced only where
they were vague, with the replacement shown in the open questions if it could be wrong.
What the person said they do not want goes to "out", with "asked for exclusion" as the reason.
Each question asked carries the answer the writer expects, so a yes costs one word and a no
corrects a concrete guess. The questions stop when the next three answers can be predicted.
"Whatever you think is best" is a delegation, written down as one; "sounds good" is not a
yes to the exact words, and the exact words are read back. The read-back ends with what is
out of scope.

## More than one module

A spec for something with several parts starts with a map before any part is written: one
row per module, what it owns, which modules it depends on, and the order they can be built
in. A dependency that goes both ways is a design error found here, not in the code. Each
module then gets its own spec in the sections above, and the shared vocabulary lives in one
file they all point to.

## Where it goes

`docs/specs/<kebab-name>.md` when the project has a `docs/` folder, else beside the README,
after a yes; the file name is the feature, not a date. A spec that replaces another links to
it and the old one gets a line at the top saying it is superseded. A spec is never deleted.
