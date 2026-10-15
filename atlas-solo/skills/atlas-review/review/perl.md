# Perl — .pl .pm .t

Checks to run before reading: `perl -c` on each changed file (with `-I lib` when the project
has one), then `prove -l t/` or the project's test command. A compile error or a red test is
the first line of the review.

## breaks

A file without `use strict; use warnings;` (or `use v5.36` and later, which turns them on).
A shell command built by concatenating input: backticks, `system "..."`, one-argument
`open` with a pipe, `qx` with a variable inside; the list form or `IPC::Run3` reads the intent.
Two-argument `open`, or `open` without the error checked (`or die "...: $!"` / `autodie`).
String `eval`; block `eval` whose `$@` is never looked at.
A regex that spans lines with `.*` and no `s` or `m` flag by intent; a capture used after a
match that may have failed (`$1` from the previous successful match).
`sort` on numbers without `{ $a <=> $b }`; `==` between strings; `eq` between numbers from
input.
A hash or array `print`ed or returned in scalar context where the content was meant.
A module `require`d inside a function on every call; `local $_` missing inside a loop that
calls code using `$_`.
Encoding: a file opened without a layer when its content is not ASCII; `utf8` on only one side
of a boundary.

## fragile

Bareword file handles; `$|` or `$/` changed and not restored with `local`.
A regex without `/x` once it exceeds a line of intent; numbered captures where named ones
would carry a comment.
Nested data built by hand with `@{$h{$k}}` autovivification relied on both for reading and
writing: reading creates keys as a side effect.
A `wantarray`-sensitive return at a call site that takes the other context.
`Data::Dumper` left in; `warn` where the program's log function exists.
An object built as a blessed hash in a codebase that uses `Moo` / `Moose`, or the reverse.

## unclear

A line with more than two of `map`, `grep`, `sort` chained and no name for the intermediate;
a `unless ... else`; `$_` used across two levels of nesting; a `goto`.

## Not findings here

Tabs against spaces where `perltidy` has not been configured; `perlcritic` levels the project
has not set; whether `Moo` or plain `bless` is used when the file matches its neighbours.
