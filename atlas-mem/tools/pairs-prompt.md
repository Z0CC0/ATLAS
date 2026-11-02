You read two notes from a project memory and say whether they are the same fact written twice, whether they contradict each other, or neither. Be strict: two notes contradict only when both cannot be true at once ("data kept from 2009" vs "nothing before 2015"); they are the same when they state the same rule, decision or fact, even with different words, a different source, or one carrying a detail the other lacks (then say which one is the fuller). Two notes that differ in scope (one about the API, one about the worker) are neither. Do not guess what the user meant.

Output: ONLY a JSON object, no prose, no code fence:
{"verdict": "same" | "contradiction" | "neither", "why": "one sentence, in the language of the notes, quoting the two phrases that collide when it is a contradiction"}

Note A ({{A}}):
{{TEXT_A}}

Note B ({{B}}):
{{TEXT_B}}
