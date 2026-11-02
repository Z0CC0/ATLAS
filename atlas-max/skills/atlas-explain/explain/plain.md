# In plain words

For a reader who does not code, or who codes but has never seen this part. The test of
every sentence: could this reader repeat it to someone else correctly? If not, it is not
explained yet.

## Order

1. **What it is for**, from the reader's side: what they wanted, in their words.
2. **What happens**, as a short story with a beginning and an end: "when you press this,
   the program does A, then B, then you see C". Three to six steps. The real names of the
   things on screen or in the folder, so the reader can find them.
3. **The one thing to understand** that makes the rest make sense: the invariant, the
   limit, the reason it is built this way. One paragraph. This is the part worth the reader's
   attention; everything else is scaffolding.
4. **What it cannot do**, in one or two sentences, because the reader will try it.
5. **What to do if** the one thing that goes wrong most often goes wrong.

## Words

Every technical term is either replaced by what it means ("a small file that remembers your
choices" instead of "the config") or defined the first time, in the same sentence, with the
plain meaning first and the term after in parentheses, so the reader learns the word they
will meet later. Never the reverse. No abbreviations unless the reader uses them already.

## Analogies

Only when the analogy holds in the ways the reader will use it. "Like a library catalogue"
is fine for an index; it breaks the moment the reader asks who writes the catalogue. Say
where it stops: "like a catalogue, except it rewrites itself every time a file changes".
One analogy per explanation; two compete.

## Numbers

A number helps when the reader can feel it ("about the length of this page", "under a
second", "once a day"); it hurts when it is precise without a scale (the reader does not
know whether 4,700 tokens is much). Give the scale, then the number, or leave it out.

## What to leave out

How it is implemented, unless the reader asked; the history of how it got here; the
alternatives that were not chosen (that is `decision.md`); anything the reader cannot act
on or check. The explanation is finished when nothing can be removed without the reader
losing the one thing.
