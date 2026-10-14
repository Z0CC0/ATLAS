# Perl

Perl is found in old scripts more often than in new projects, so the first rule weighs more
here than anywhere: the file's own style wins, even when it is not what follows. Read the
`use` lines and the `cpanfile` or `Makefile.PL` before writing; the version in `use v5.xx`
decides which features exist.

## Every file

`use strict; use warnings;` at the top, or `use v5.36` and later, which turns them on.
`use utf8` when the source holds non-ASCII; `binmode` or the `open` pragma for the
encoding of handles. A script is a program, not a module: `main` guarded, exit codes
meaningful. A module is a package with `our $VERSION`, exports listed explicitly in
`@EXPORT_OK`, nothing in `@EXPORT`.

## Writing

Lexical variables, declared where first used, in the smallest scope. Three-argument `open`
with a lexical handle and the error checked (`or die "...: $!"`), or `autodie`. Regular
expressions with `/x` once they exceed one line of intent, named captures where a number
would need a comment. `local $_` or an explicit variable in nested loops; `$_` left alone
inside callbacks the caller may rely on. References and data structures built with
`[]` and `{}`; `Data::Dumper` only for debugging, never left in. String `eval` never;
block `eval` with `$@` checked at once, or `Try::Tiny` where the project has it.

## Objects

`Moo` or `Moose` where the codebase has them; a plain blessed hash with accessors written by
hand where it does not, matching the existing classes. `use parent` for inheritance,
`@ISA` not assigned by hand. On `use v5.38` and later, the `class` feature only if the
project has already adopted it.

## Typical mistakes

- `print` of a hash or array in scalar context; the count is not the content.
- A regex with `.*` that spans lines, or a greedy match where a lazy one was meant.
- `sort` on numbers without `{ $a <=> $b }`.
- Two-argument `open`, bareword handles, `$|` left on by accident.
- A module loaded with `require` inside a function on every call.
- Shell commands built by string concatenation; the list form of `system` and
  `IPC::Run3` or `IPC::System::Simple` instead.

## Tooling

`perltidy` with the project's `.perltidyrc`; `perlcritic` at the severity the project has
set, not stricter. Tests under `t/` with `Test::More` or `Test2`, run with `prove -l`.
Dependencies in `cpanfile`, installed with `cpanm` or `carton`; the lock file committed
where there is one.
