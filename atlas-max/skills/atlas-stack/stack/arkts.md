# ArkTS (HarmonyOS)

ArkTS is TypeScript with the dynamic parts removed: no `any`, no structural typing tricks,
no changing an object's shape after it is built. `typescript.md` applies for everything the
language shares; what follows is where ArkTS departs from it. Read the SDK version in
`build-profile.json5` before choosing an API: the UI framework changes between API levels.

## Types

Every variable, parameter and return typed; no `any`, no `unknown` as a way out. Objects
are classes or interfaces declared up front; fields are not added later, `delete` is not
used. Union types where a value really has two shapes; `as` only to narrow after a check,
never to silence the compiler. `null` and `undefined` handled explicitly; optional chaining
and nullish coalescing where the project already uses them.

## UI with ArkUI

A page is a `@Entry @Component` struct; a reusable piece is a `@Component` struct. State
lives in the decorators made for it: `@State` for what the component owns, `@Prop` for a
copy from the parent, `@Link` for two-way binding, `@Provide` / `@Consume` across levels,
`@ObjectLink` with `@Observed` classes for nested objects. On API levels that have them,
the V2 decorators (`@Local`, `@Param`, `@ObservedV2`) in new code, not mixed with V1 in the
same component. The `build()` method holds only layout and bindings; computation goes to
methods or the view model. `@Builder` for reusable UI fragments, `@Styles` and `@Extend`
for shared attributes. Lists use `LazyForEach` with a data source once they can grow;
`ForEach` with a stable key function otherwise.

## Ability and lifecycle

`UIAbility` is the unit the system starts and stops; its `onCreate`, `onForeground`,
`onBackground` hold what has to happen at those moments and nothing long. Work that
outlives a page goes to a background task API or a worker, not to a timer in the page.
Context is passed in, not reached for globally. Permissions declared in `module.json5`
and requested at the moment they are needed, with the refusal handled.

## Modules and resources

One feature per HAR or HSP module when the project is split that way; `oh-package.json5`
names the dependencies. Strings, colours and dimensions in `resources/`, referenced with
`$r('app.string.name')`, never inlined for text the user sees. Assets by density where
the design provides them.

## Typical mistakes

- `@State` on an object and then mutating a nested field: the UI does not refresh.
  `@Observed` + `@ObjectLink`, or V2 `@ObservedV2` + `@Trace`.
- Heavy work in `build()` or in `aboutToAppear` on the UI thread.
- An API from a newer level used without a `canIUse` check on a project that targets an
  older one.
- `ForEach` without a key function on data that changes order.

## Tooling

DevEco Studio's own checker and the `ArkTS` linter decide what compiles; the project's
`code-linter.json5` is the house style. Build with `hvigorw`; tests with the Hypium
runner where the project has them.
