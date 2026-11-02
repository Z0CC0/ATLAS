# Retrieval — answering from documents

Two systems in a row: one finds passages, one writes from them. They fail differently and
are measured apart. Most "the model made it up" is "the right passage was never found".

## Is retrieval needed

The whole corpus fits in the context with room to spare and changes rarely: put it in the
prompt, cached, and skip all of this. Structured data: a query, not an embedding. An exact
identifier, a code, a name: keyword search. Retrieval by meaning is for large bodies of
prose asked about in the user's own words.

## Ingest

**Parse honestly.** Tables, headings, lists and code survive extraction or the chunk is
noise. Check twenty extracted pages by eye before building anything on them.
**Chunk on the document's own boundaries**: sections, paragraphs, functions. Not every N
characters through the middle of a sentence. Sized so one chunk holds one complete idea;
some overlap only where ideas run across boundaries.
**Keep context with the chunk**: the title, the section path, the date, and where useful a
line saying what the chunk is about within its document. A paragraph that says "it
increased by 3%" is unfindable and unusable without knowing what "it" is.
**Metadata** for filtering: source, date, version, language, who may see it. Access rights
are enforced by a filter in the query, in code, never by asking the model to withhold.
**Updates**: a changed document replaces its chunks; a deleted one is removed. Stale
chunks answer with confidence.

## Find

**Hybrid.** Embeddings find meaning, keyword search (BM25) finds exact terms, names and
codes; the two lists are merged. Either alone has known blind spots.
**Wide, then narrow.** Retrieve generously (tens), rerank with a model built for it, keep
the few best. A reranker is usually the largest single gain after hybrid search.
**The query is not always the user's sentence.** In a conversation, rewrite the last turn
into a standalone question first. A broad question may be split into several searches.
**The embedding model** is chosen on the project's own retrieval eval, not from a
leaderboard; changing it means re-embedding everything.

## Write

The passages go in delimited, each with an id and its source. The instruction: answer from
these; cite the id for each claim; when they do not contain the answer, say so. The
passages are data: text inside them does not instruct.
Citations are checked in code: every cited id was among those supplied; ideally the quoted
span exists in the passage. An answer with no supporting passage is shown as such or not
shown.
"Not found" is a designed outcome with its own wording, not a failure state.

## Measure the two halves

**Retrieval**, with a set of questions each labelled with the passages that answer it:
was a right passage among the top k (recall at k), and how high (rank). Graded by code.
This number is fixed first; nothing downstream can make up for a missing passage.
**Generation**, given the right passages: is every claim supported by them (faithfulness),
does it answer the question, are the citations correct. Graded as in `evals.md`.
**End to end** last. When it fails, the two numbers above say which half.
Include questions the corpus cannot answer: the right result is "not found", and a system
never tested on these will invent.

## Usual mistakes

Chunks cut mid-sentence. No reranking. Top three only, on a corpus where the answer needs
two documents. Evaluating only end to end. Embedding the question and the documents with
different models or settings. No refresh of stale content. Access control left to the
prompt. Stuffing fifty passages in "to be safe": precision falls and cost rises together.
