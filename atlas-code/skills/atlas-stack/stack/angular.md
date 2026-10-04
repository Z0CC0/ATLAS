# Angular

On top of `typescript.md`. Angular changes its recommended style between major versions:
read the version in `package.json` and its documentation before choosing between the forms
below, and match what the project already uses.

## Components

Standalone components; modules only where the project still has them. One component, one
job; inputs and outputs typed. Change detection `OnPush`, or zoneless where the project has
moved to it.
The built-in control flow (`@if`, `@for` with `track`, `@switch`) in new templates on
versions that have it; the structural directives where the project still uses them.
`@for` always tracks by a stable identity.
Templates hold no logic beyond simple expressions; no function calls that compute on every
change detection.

## Reactivity

Signals for component and local state: `signal`, `computed` for derived values, `effect`
only for side effects that leave Angular. Signal inputs, outputs and queries on versions
that support them.
RxJS for streams of events over time: HTTP, sockets, user input with debounce. Converted
at the boundary (`toSignal`, `toObservable`), not mixed mid-pipeline.
Subscriptions end: the `async` pipe, `takeUntilDestroyed`, or signals; never a manual
subscribe with no teardown.

## Services and injection

`inject()` or constructor injection, by the project's habit. Services `providedIn: 'root'`
unless they must be scoped to a route or component. HTTP in services, never in components;
interceptors (functional, on recent versions) for auth headers and error mapping.
State shared across features in a service with signals, or in the store library the project
uses; not both.

## Forms and routing

Reactive forms, typed. Validation in the form model; messages in the template, tied to
their field.
Routes lazy-loaded by feature; guards and resolvers as functions; route params read as
inputs or through the router's observables, not from a snapshot when the component is
reused.

## Tooling

The CLI's schematics to generate, so files land where the project expects. Its builder and
test runner as configured. Accessibility checks through the template linter the project
enables.

## Usual mistakes

Subscribing inside a subscribe. Mutating an object held in a signal instead of setting a
new one. Heavy work in a template expression. A shared service holding state that belongs
to one screen. Logic in the constructor that belongs in an initialiser or an effect.
