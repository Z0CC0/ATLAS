# Collect — a scheduled job that gathers public data and enriches it with a model

Job listings, prices, releases, news, anything public that changes: fetched on a schedule,
cleaned, optionally scored or summarised by a model, stored, and shown or sent.

## Before writing it

**Is it allowed.** The site's terms and its `robots.txt`; whether the data is personal;
whether there is an official API or a feed that makes scraping unnecessary. An API or an
RSS feed is always preferred to parsing pages. Content behind a login, or that the terms
forbid collecting, is not collected: say so and stop.
**What is the question.** What a row is, which fields, what makes two rows the same item,
how fresh it needs to be, and who looks at the result. A collector with no reader is a
bill.

## Three layers, kept apart

**Collect.** One small connector per source, each returning the same row shape. In order
of preference: an official API; a feed; structured data already in the page (JSON-LD, an
embedded JSON blob, the JSON endpoint the page itself calls); only then HTML selectors.
A real browser only when the content is rendered by script and there is no endpoint.
Polite by construction: an honest user agent with a contact, a delay between requests, a
low concurrency per host, conditional requests (`ETag`, `If-Modified-Since`), backoff on
`429` and `503`, and a stop on `403`, not a workaround. No evasion of blocks or CAPTCHAs.
A connector that returns nothing where it used to return rows raises an alarm: the page
changed. That is the commonest failure, and silent by default.
**Enrich.** Code first: normalise, deduplicate by a stable key (a hash of the fields that
identify the item), filter by the rules that can be written as rules. A model only for
what is left (`method.md`): relevance, classification, a summary. Items sent in batches
in one call with a structured output keyed by item id; never one call per row.
Only new or changed items are sent: the hash says which. The model's output is validated
like any other, and an item it fails on is kept unenriched, not dropped.
**Store and show.** Whatever the user already has: a file in the repository, a
spreadsheet, a database, a notes tool. Upserts by the stable key, so a rerun does not
duplicate. The time first seen and last seen on every row.

## Scraped text is hostile

A page can contain text written to instruct a model. Scraped content goes into the prompt
as delimited data; the enrichment call has no tools; its output is used only as the fields
asked for; nothing scraped is ever executed, followed as a link automatically, or placed
in a notification without escaping.

## Schedule

The project's existing scheduler, or the repository host's scheduled workflow for a small
job. Idempotent runs; a lock so two runs do not overlap; a time limit; secrets from the
platform's secret store. Each run logs: sources tried, rows fetched, new, changed, sent to
the model, failed, and the tokens used.
Free tiers of model APIs have limits that change: read the current limits, and build a
fallback (skip enrichment, keep the rows) for when they are hit.

## Learning from the reader

If the reader marks items as good or bad, keep those marks as data and feed a small recent
sample into the scoring prompt as examples. Check with the evals in `evals.md` that it
helps: more examples is not the same as better.

## Report

```
sources   3 (1 API, 1 feed, 1 HTML)  ·  robots and terms checked 2026-10-04
run       212 fetched · 9 new · 2 changed · 201 unchanged
model     11 items in 1 call · 2,140 in / 380 out · 11 valid
stored    data/listings.json  (upsert by id hash)
not       the HTML source has no change alarm yet
```
