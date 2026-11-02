# PHP — .php

Checks to run before reading: `php -l` on the changed files, `phpstan`/`psalm` and
`phpunit`/`pest` on the changed module when the project runs them. A failure is the first
line of the review.

## breaks

Query built by interpolation; `DB::raw`/`whereRaw` with input and no bindings; `shell_exec`,
`exec`, `system`, `passthru` with input; `eval`; `unserialize` on untrusted data; `include` with
a path from input.
`{!! $x !!}` in Blade on anything that came from a user; `echo $x` in a template without
escaping.
Mass assignment: `$guarded = []`, `create($request->all())`, `fill($request->all())` where the
model has fields the user must not set.
File uploads without MIME, size and extension checks; a stored path from input without
`Storage` and a prefix check.
`catch (\Exception $e) {}` around a write; a controller action that reads input with no
FormRequest or `validate()`.
MD5 or SHA-1 for passwords; home-made tokens; secrets in source.

## fragile

Missing `declare(strict_types=1)` in a non-view file when the rest of the project has it;
public methods without parameter and return types; `mixed` where a union is known.
N+1: a relation touched in a loop or in serialisation without `with()` or `load()`; missing
`$fillable`/`$casts` on a model that is mass-assigned; business logic in a controller where
the project uses actions or services.
A constructor-promoted property never reassigned and not `readonly`; a class not designed for
inheritance and not `final`, when the project marks them.
`count($collection)` used for emptiness where `isEmpty()` says the intent.

## unclear

`dd`, `dump`, `var_dump` left in; unused `use` imports; PHP and HTML interleaved in a view the
project writes in Blade sections.

## Not findings here

PSR-12 spacing and brace placement; docblocks on simple public methods; naming.
