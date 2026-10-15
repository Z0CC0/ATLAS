# ArkTS — .ets

On top of `typescript.md`. Checks to run before reading: the ArkTS linter of DevEco
(`code-linter.json5` decides the rules) and a build with `hvigorw`; a type error is a build
error here, there is no `any` to hide behind. A failure is the first line of the review.

## breaks

A nested field of a `@State` object mutated in place: the component does not refresh. The
fix is `@Observed` + `@ObjectLink`, or the V2 decorators (`@ObservedV2` + `@Trace`), not a
copy of the whole object on every change.
`@Prop` used where the child writes back (the parent never sees it); `@Link` where the parent
is not the owner.
V1 and V2 state decorators mixed in one component.
An API from a newer SDK level called without a `canIUse` check on a project whose
`build-profile.json5` targets an older one.
`ForEach` without a key function, or with the index as key, on data that is reordered or
removed from.
Work in `build()`: a function call that computes, a network call, a loop over data not
already prepared.
A permission used before it is declared in `module.json5` and requested; the refusal path
missing.
`as` used to silence the compiler on a value whose runtime type was not checked; `JSON.parse`
result typed and used without a check.

## fragile

`ForEach` on a list that will grow past a screen when `LazyForEach` with a data source was
the form; a `List` without `cachedCount` on long data.
State kept in a global object reached from several pages where `@Provide` / `@Consume` or
`AppStorage` is the project's form.
A string shown to the user inlined instead of `$r('app.string.…')`; a colour or dimension
inlined where `resources/` holds it.
`aboutToAppear` doing long work on the UI thread; a timer in a page that outlives the page.
A `UIAbility` lifecycle method with logic that belongs to the page, or the reverse.
A `@Builder` that reads component state through closure instead of parameters.

## unclear

A component over three hundred lines with every branch of the UI in one `build()`;
`@Styles` / `@Extend` not used where the same attribute block appears four times; a page
and its view model in one struct.

## Not findings here

Ordering of attribute chains; whether `@Component` structs are one per file; DevEco
project layout the tool generated.
