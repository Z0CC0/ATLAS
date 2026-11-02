# An opinion from outside — a question, a judgement call, a decision

## Own answer first

Before any packet goes out, write this model's answer: the position, the reasons, the main
doubt. Kept aside. Without it the final answer is whatever the last voice said.

## Ask

One packet, the same for every voice, by `method.md`. The shape asked for: a position in one
line, up to three reasons, what would change their mind, and how sure they are and why. At
most twelve lines.

A decision with more than one good answer: the same three roles as `atlas-plan`'s decide
angle can be given, one per voice, when there are three voices; with fewer, every voice gets
the plain question.

## Read the answers as claims

Each answer is checked, not counted. A reason that rests on a fact is looked up when `check`
is on, and marked `unverified` when it is not. A voice that answers a different question
than the one asked is noted as such and set aside. Two voices agreeing do not make a fact
true; three do not either.

## Report

```
question   keep refresh tokens in an httpOnly cookie or in memory with silent re-auth
mine       cookie — survives reload, not readable by script
codex      cookie, SameSite=Strict; add rotation on use           other vendor
gemini     memory — cookie widens CSRF surface unless every route checks origin   other vendor
agree      rotation on use, short access token
split      2 to 1 on storage; the dissent is about CSRF, which SameSite=Strict addresses
verdict    cookie, httpOnly + Secure + SameSite=Strict, rotate on use
changed    added rotation; my first answer did not have it
```

`mine`, each voice with its label, where they agree, where they split and on what, the
verdict, and what the outside answers changed, or `changed nothing` when that is the case.
The verdict is this session's and picks one. A voice that gave no answer is one line:
`gemini  no answer — <exact error>`.

Asked only "what do they say" with no decision wanted: the same report without `verdict`.
