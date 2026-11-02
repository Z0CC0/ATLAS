# PHP and Laravel

Check the PHP and framework versions in `composer.json` first.

## The language

`declare(strict_types=1)` in every file. Types on parameters, returns and properties;
`readonly` properties and classes for values; enums for closed sets; `match` over
`switch`. Constructor property promotion. Named arguments where they aid reading.
Exceptions, specific, never suppressed with `@`. No dynamic properties, no `extract`, no
variable variables.
PSR-12 formatting through the project's fixer; static analysis at the level the project
sets, and new code does not lower it.
Composer autoloading only; no `require` of project files.

## Laravel — structure

Controllers thin: authorise, validate, call, respond. Rules that span models or have
steps go in action or service classes with one public method; simple CRUD needs neither.
Validation in form request classes, which also hold the authorisation check for that
request.
Responses through API resources, so the shape is explicit and nothing extra leaks.
Route model binding, scoped for nested resources. Named routes. Middleware for what
applies across routes.
Configuration through `config()` reading from `env()` only inside config files, so config
caching works.
The container for dependencies: type-hinted constructor injection, interfaces bound in a
service provider when there is more than one implementation.

## Eloquent

Relations eager-loaded where they are used (`with`, `load`); lazy loading prevented in
development so an N+1 fails loudly. `select` only the columns needed on wide tables.
Query scopes for reusable filters; a query object for a complex search.
Casts, including enum and custom casts, in place of manual conversion. Accessors and
mutators through the attribute syntax.
Mass assignment controlled: `$fillable` named, and only validated data passed in; never
`$request->all()` into `create` or `update`.
`DB::transaction` around multi-step writes; jobs and events dispatched after commit.
`chunkById` or cursors for large sets; `upsert` and set-based updates for bulk changes.
Migrations reversible, one concern each (`database.md`).

## Work in the background

Jobs for anything slow or that calls outside. Idempotent, with tries, backoff and a
timeout; unique where duplicates would hurt; models passed by id.
Events and listeners to decouple side effects; not for the main flow, which should be
readable in one place.
The scheduler for periodic work, with overlap prevention.

## Security

Policies and gates for authorisation, called on every action, including ones reached by
id. Blade escapes with `{{ }}`: `{!! !!}` only on content the code built or sanitised.
The query builder's bindings for all input; no interpolated raw SQL.
CSRF protection on for web routes. Passwords through the `Hash` facade. Sanctum or the
project's choice for API tokens, with abilities.
Rate limiting on login and other sensitive routes. Uploads validated by type and size and
stored on a non-public disk. `APP_DEBUG` off in production; the `.env` file never in the
web root or the repository.

## Choosing a package

From Packagist: maintained recently, compatible with the installed framework version, with
real usage. Prefer first-party packages. One package per need.
