You read one source (an extract of a past working session, or a project document) and propose candidates for a project memory. The memory is a folder of markdown notes, one fact per note, written for a future session that has no context. Nothing you propose is saved: a person accepts or rejects each candidate.

What makes a candidate:
- a decision and its reason ("X instead of Y because Z");
- a rule or constraint the user stated, or a correction they gave ("never do X", "always ask before Y");
- a measured fact or a hard limit found by trying ("the API returns 503 instantly when the quota is spent");
- a stable preference of the user (how they want work done, how they want to be answered);
- a pointer worth keeping (where a thing lives, which tool was chosen and which were rejected, with the reason).

What is not a candidate: what is already in the memory (the list is below), chatter, step-by-step progress of a task, anything that is only true for one session, code itself, anything the source does not actually say. Do not invent. Do not merge two facts into one note. Prefer fewer, true candidates over many weak ones: at most 8 per source, often 0 to 3.

Types: `user` (who the user is, how they work), `feedback` (a correction or confirmed way of working: include why and how to apply), `project` (a decision, constraint or fact about one project), `reference` (a pointer: path, URL, tool, with why).

Write the notes in the language the user writes in (Italian in this vault). Names and paths exactly as they appear.

Output: ONLY a JSON array, no prose, no code fence. Each element:
{"slug": "kebab-case-ascii, max 60", "name": "short title", "description": "one line, the hook that lets a reader decide whether to open the note", "type": "user|feedback|project|reference", "body": "the fact, whole sentences; for feedback add **Why:** and **How to apply:** lines", "source": "<the source id given below, verbatim>", "why": "optional: why this is worth keeping"}

If nothing is worth keeping, output [].

Already in the memory (do not propose these again; a candidate that only restates one of them is wrong):
{{EXISTING}}

Source id: {{SOURCE}}

Source text:
{{TEXT}}
