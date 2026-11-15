# Report mode — a long research, for `atlas-search` and `atlas-research`

Read when the request asks for a report: "a report on", "research this in depth", "compare these
properly", "deep research", in any language. The answer shape settles a question in a few lines;
this one covers a topic, from several angles, in a document the person keeps.

The structure here follows the `deep-research` skill Anthropic ships with Claude: one coordinator
that never reads a page, several researchers in parallel, one writer, one round of gap-filling at
most. The prose is ours; what was taken is the shape, because it is the part that was tested.

## The caller (`atlas-search`) coordinates and reads no page

1. **Split the question** into subtopics that do not overlap and together cover it. The count
   follows the question, not a habit:

   | researchers | when | example |
   |---|---|---|
   | 1 | one factual question that only needs depth | "how does X's pricing work" |
   | 3 | a focused topic with a few natural angles | a technology: how it works, who uses it, where it fails |
   | 4 | a comparison, one per criterion | price, features, integrations, what users report |
   | 5 | several entities, regions or domains | one per country, one per vendor |
   | 6+ | a set to cover systematically | one per cluster of the set |

   Three when in doubt. Never more than the question has angles: each researcher is a session.

2. **Name the research** in the person's language, three to six words, letters and spaces only.
   Make `research_notes/<name>/` and `reports/` in the working folder. A name already used in the
   folder gets a number.

3. **Start every researcher in the same turn**, each an `atlas-research` call with: the subtopic,
   what the notes must cover, two or three key questions, the kinds of source to prefer, the
   constraints inherited from the request (time, place, language), and the absolute path of this
   file. Carry the constraints word for word: a researcher that does not know "as of 2026" answers
   about any year.

4. **Save each researcher's notes** as `research_notes/<name>/<subtopic>.md`, exactly as returned.
   The agent cannot write; the caller does, and writes nothing else into them. Then run
   `node "${CLAUDE_PLUGIN_ROOT}/tools/report.mjs" check research_notes/<name>`: it prints, by
   file and line, a note that lost its shape and every finding with no source or no date. A
   note it names goes back to its researcher once, with those lines; this is not the gap
   round of step 5. What still fails after that is given to the writer as a gap.

5. **One more round only if a gap would make the report wrong,** not merely shorter. Say so in
   one line before starting it, then write the report whatever comes back. A second round is
   never run.

6. **One writer**: an `atlas-research` call with the folder of notes, the original question in
   full, the path of this file, and the instruction to return the report. Save it as
   `reports/<name>.md` and tell the person the path, with the BLUF paragraph pasted under it.

## The researcher (`atlas-research`, given a subtopic)

Search with more than one phrasing; open the two or three pages that carry the answer; prefer the
source over anyone writing about it; check the date on anything that changes; stop when the key
questions are answered or three searches in a row add nothing. Every rule of `atlas-research`
holds: nothing from memory, a disagreement reported with both sides, a gap named and not filled.

Return the notes in this shape, and nothing around them:

```
# <subtopic>

## <key question 1>
### Takeaway
One or two sentences: what the sources say, taken together.
### Cited findings
- <fact, with a number or a date where there is one> — <source URL>, <date of the page or "undated">
### Inferences
- <what follows from the findings but no source states> — marked as inference
### Gaps
- <what was looked for and not found, and where>

## <key question 2>
...
```

Facts and inferences never share a bullet. A finding without a URL is an inference.

## The writer (`atlas-research`, given the notes)

Read every note. Write one report that answers the original question, in the person's language:

- **Title**: six words at most, with a verb, saying what the report found, not what it is about.
- **BLUF**: one paragraph first, the answer in full, for someone who reads nothing else.
- **Sections**: each heading states a finding ("Prices converge above 50 users"), not a topic
  ("Pricing"). Each section opens with its claim, then the evidence, the most important figures
  in **bold**, each figure with its citation as `[n]` resolved in a list at the end.
- **Disagreements** between sources stay visible, with both sides and their dates.
- **Gaps** from the notes appear in the report as gaps. Nothing is filled from memory.
- **Conclusion**: what the findings mean for the question asked, and what would change the
  answer.
- **Length** follows the material: a report with four notes is not padded to look like six.

Return the report, and nothing around it. The caller saves it.

## What this costs, so the person can decide

Each researcher and the writer is a full session with web searches: a four-researcher report is
five sessions, often several dollars of usage, and a few minutes. The answer shape costs one. When
the request could be either, the words decide, never a guess: "report" is this; a question is the
answer shape.
