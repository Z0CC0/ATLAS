# Java and Kotlin builds

Commands, the wrapper when present: `./gradlew build -x test` then `./gradlew test`, or
`./mvnw -q compile` then `./mvnw -q test`. `detekt`, `ktlintCheck`, `checkstyle`, `spotbugs`
only when the build already runs them. Read the first error of the first failing task; the
rest of a Gradle log is consequence.

## Java

`cannot find symbol` — missing import, a typo, or a dependency not on the classpath (stop).
`incompatible types` — convert explicitly; a generic mismatch usually means the declaration
is wrong, not the use.
`method … cannot be applied to given types` — count and types of arguments against the
current signature.
`variable might not have been initialized` — initialise on every path, or restructure so one
path assigns.
`non-static … cannot be referenced from a static context` — an instance is needed; do not
make the member static to quiet it.
`unreported exception … must be caught or declared` — declare it if callers can handle it,
catch it where something useful can be done; never an empty catch.
`reached end of file while parsing` — an unbalanced brace, usually above the reported line.
`package … does not exist`, `class file not found` — a dependency or a module boundary: stop.
`Source option N is no longer supported` — toolchain mismatch: stop.
Annotation processor exceptions (Lombok, MapStruct) — processor order or version: stop.
Spring at startup: `No qualifying bean of type` (missing stereotype annotation or outside the
scanned package), `Circular dependency` (a design decision: stop), `Failed to bind properties`
(the property name or type in the config).

## Kotlin

`Unresolved reference` — import, typo, visibility (`internal`, `private`), or dependency.
`Type mismatch: required X, found Y` — nullable versus non-null most often: handle the null,
not `!!`.
`Smart cast is impossible` — the property is mutable or has a custom getter: copy to a local
`val`, then check.
`'when' expression must be exhaustive` — add the missing branches; not `else` on a sealed
type.
`Suspend function … should be called only from a coroutine` — make the caller `suspend`, or
launch in the scope the caller already owns; not `runBlocking` inside one.
`None of the following candidates is applicable` — argument types; a lambda where a function
reference is expected or the reverse.
`Conflicting declarations`, `Platform declaration clash` — rename or `@JvmName`.
`Could not resolve group:artifact:version` — repository or version: stop.

## Stops specific to this toolchain

Editing dependencies in `pom.xml` / `build.gradle*`, plugin versions, the JDK or Kotlin
version, `@Suppress`, `@SuppressWarnings`, baseline files for detekt.
