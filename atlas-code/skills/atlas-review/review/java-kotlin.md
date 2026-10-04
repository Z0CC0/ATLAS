# Java and Kotlin — .java .kt .kts

Checks to run before reading: the build (`./gradlew build -x test` or `mvn -q compile`),
then the tests of the changed module; `detekt` or `ktlint` for Kotlin, `spotbugs`/`checkstyle`
when the project runs them. A failure is the first line of the review.

## breaks

Query built by concatenation: `@Query` with `+`, `JdbcTemplate` with `String.format`,
`createNativeQuery` with input; `ProcessBuilder`/`Runtime.exec` with input in the command;
`ScriptEngine.eval` on input; `new File(input)` / `Paths.get(input)` without
`getCanonicalPath` and a prefix check.
Empty `catch`, or `catch (Exception e) { log… }` and continue, around a write.
`Optional.get()` without `isPresent()`; in Kotlin `!!` on a value that can be null on a real
input; `lateinit` read before a path that initialises it.
Shared mutable state from several threads with no synchronisation; Kotlin coroutines launched
on `GlobalScope` or without structured parent, so cancellation never reaches them; a
`runBlocking` inside a coroutine or a request thread.
Secret in source or in `application.yml` committed; token or password in a log statement near
auth code.
Spring: a request body without `@Valid`; CSRF disabled with no reason; a `@Transactional`
method called from the same class, so the proxy never sees it; `@Transactional` on a
controller or repository.
Field injection where the project uses constructor injection: the object is constructible in
an invalid state.

## fragile

A JPA entity returned straight from a controller; a `List<T>` endpoint with no paging;
`FetchType.EAGER` on a collection, or a related entity touched in a loop without a fetch join
or entity graph: N+1.
`@Transactional(readOnly = true)` missing on read-only service methods that the project marks.
Returning `200` with an empty body where `404` or `201` is the contract.
Kotlin: `?.let` chains three deep with no `?:` fallback; a `data class` with a mutable
collection in its `equals`; `when` over a sealed class with an `else`, hiding a new subtype;
a `Flow` collected without a scope that ends; `withContext(Dispatchers.IO)` missing around
blocking I/O inside `suspend`.
Java: a mutable collection exposed through a getter; `equals` without `hashCode`; a `Stream`
reused after a terminal operation.

## unclear

`var` in Kotlin where the value never changes; `java.util.Date` in new code; string
concatenation in a loop.

## Not findings here

Lombok versus records when the project has chosen; package layout; Javadoc on private
members.
