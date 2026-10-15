# A skill or a subagent

Two texts, with two costs. The **description** in the frontmatter is loaded in every session
of everyone who installs the plugin, used or not; it exists to make the model pick the
skill at the right moment and never otherwise. The **body** is loaded only when the skill
runs; it exists to make the work right. A long description is the most expensive line of a
plugin; a short body is the cheapest mistake.

## The description

Under ninety words. What it does, in the first sentence, with a verb. When to use it, as
the words a person would type, in the second ("Use for 'fix the build', 'CI is red' — in any
language"). When not to, in the third, if another skill would be picked by mistake. No
adjectives, no promises, no list of features: the body has those. Measured with a tokenizer
on the built frontmatter, because the figure is what the user pays.

## The body

A router, not a manual: what to read (one file per case, named by the words of the request),
what to do before starting (the two things to check), what needs a yes, what the other
skills do so this one does not, the form of the answer. Under eighty lines. The rules live in
files beside it, one per case, read only when that case is on: a skill whose body holds every
rule costs them all every time.

## The rule files

One per angle or language, under four hundred words, in sections a reader can jump to
(what breaks, what is fragile, what is not a finding; or: order, commands, typical mistakes).
Written from cases, not from the documentation: a line that no real diff would trigger is
removed. The same fact never lives in two files; one points at the other.

## A subagent

Its description says what it returns and what never comes back with it ("the log stays
here"), because that is why the caller delegates. Its tools are the fewest that do the job;
a subagent that cannot write cannot break anything. Its body says what the caller gives it
(root, mode, absolute paths of the rule files), how it works, and the exact shape of what it
returns; the return is the whole value of a subagent, so its format is fixed, not left to
the moment.

## Checking what was written

Every file named in the body exists in the folder; every file in the folder is named
somewhere. The description routes the three phrases a person would actually type, in the
languages the users speak. The frontmatter has no angle brackets or colons that break the
parser. Then the count: descriptions of the whole plugin before and after, written in the
notes with the date.
