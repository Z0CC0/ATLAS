# A deployed page — when the request gives a URL, or says on the site, after deploy, smoke

Checking something that is live. Read-only unless told otherwise: no form submitted that
creates, pays, emails or deletes; no account created; no cookie banner accepted beyond
declining what is optional. A check that needs a write is named and left for the user to
approve.

Done through the `atlas-browser` subagent when it exists, so screenshots stay out of the
conversation. Without a browser: fetch the pages and report what a fetch can tell (status,
redirects, headers, the HTML), and say that rendering, scripts and clicks were not checked.

## Four passes, in this order, stopping at the first that fails hard

1. **It loads.** Status 200 on the pages named, or the home page and what it links to at depth
   one. No redirect loop, no mixed content, no certificate error. Console: errors quoted
   exactly, warnings counted. Failed network requests: URL and status.
2. **It works.** The main actions a visitor takes without writing anything: navigation,
   search, opening a detail, a form up to but not including submit, client-side validation
   messages. Each is one line: did what it should, or what it did.
3. **It looks as intended.** At two widths, a phone and a desktop: nothing overflowing,
   overlapping or cut, no unstyled flash, images present. Compared with a baseline only when
   the project keeps one; otherwise described as defects, not as taste.
4. **It can be used without a mouse or eyes.** Every interactive element reachable by
   keyboard in a sensible order; inputs labelled; images with alternative text; contrast on
   body text; one `h1`, headings in order.

## Report

```
https://example.com  checked 6 pages, read-only

loads     FAIL  /pricing  500 on GET /api/plans
works     not run — pricing does not load
looks     2 defects
  /       375px  hero button overflows its container
  /blog   1280px  cover image 404
access    1 defect
  /contact  email input has no label

SHIP WITH FIXES  1 blocking, 3 others
```

Verdict: `SHIP` (nothing found), `SHIP WITH FIXES` (nothing that stops a visitor from the
main task), `DO NOT SHIP` (a page does not load or the main task fails). The word is the
user's to overrule.
