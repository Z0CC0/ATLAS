# A whole flow in a browser — when the request says end to end, e2e, user flow

End-to-end tests are the slowest and the most fragile kind. Write few: the flows whose
failure means the product does not work. Sign in, the main task, pay, sign out. Everything
else belongs lower.

## Before writing

The project's e2e tool wins (Playwright, Cypress, Selenium). None: Playwright is the
suggestion, and adding it is the user's decision.
A running target: the dev server's command and URL, or a preview URL. No target: stop and ask.
Test data: how a user and their records are created and removed. A flow that needs a
hand-made account is not automated yet.

## Shape

One file per flow. The test reads as the user's steps, in their words.
Selectors by what the user sees or what assistive technology sees: role and name, label,
visible text. A `data-testid` where those are ambiguous. Never a CSS class, an nth-child, an
auto-generated id.
Page objects only when three tests share a page; before that they are indirection.
Every step waits on a condition the user would notice: the button enabled, the row present,
the URL changed. Never a fixed sleep.
Each test creates what it needs and leaves nothing behind; tests run in any order and in
parallel.
Assert the outcome a user cares about, on the page and, when it matters, in the data: the
order exists, the email was queued.

## Flaky

A test that fails one run in ten is worse than none: it teaches the team to rerun. Causes, in
order of frequency: a wait on time rather than state; data shared between tests; animation
or a spinner intercepting the click; a race between the request and the assertion; a
third-party service. Fix the cause. A test that cannot be made stable is quarantined with
the reason and a date, in the report, never silently skipped.

## On failure

Keep the trace, the screenshot and the console output the tool produces, and name where they
are. Quote the failing step and the assertion; the screenshot stays on disk, it is not
described.

## Report, on top of the usual one

One line per flow: the steps count, the time it took, `stable` after three consecutive green
runs or `flaky N/3`. A flow that found a defect: `found:` with the step where the product
did the wrong thing.
