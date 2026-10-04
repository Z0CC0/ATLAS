# Java — also Spring Boot, JPA

Check the Java version the build targets before using records, sealed types, pattern
matching or virtual threads.

## The language

Immutable by default: `final` fields, records for values and DTOs, unmodifiable
collections (`List.of`, `List.copyOf`) returned from APIs.
`Optional` as a return type for "may be absent"; never as a field, a parameter or a
collection element. `null` not returned for collections: an empty one.
Sealed interfaces with records for closed sets of shapes, and `switch` patterns over them.
Streams for transformations that read clearly; a loop when the stream needs side effects
or three nested lambdas.
Exceptions: unchecked for programming and domain errors, specific types, with the cause
attached; checked only where a caller is expected to recover. Never caught and dropped;
`try`-with-resources for anything closeable.
Constructor injection, dependencies `final`; no field injection.
Names by convention; packages by feature, not by layer, when the project allows it.
Logging through SLF4J with placeholders, not string concatenation; no personal data.

## Spring Boot

Layers: controllers (HTTP in and out, validation), services (rules and transactions),
repositories (data). A controller never returns an entity: DTO records, mapped explicitly.
Validation with Bean Validation on request DTOs and `@Valid`; one
`@RestControllerAdvice` gives every error the same shape.
`@Transactional` on service methods, on public methods called from outside the bean (a
call within the same class bypasses the proxy); `readOnly = true` for reads. No remote
calls inside a transaction.
Configuration through `@ConfigurationProperties` classes, validated at start; secrets from
the environment or a vault, not in `application.yml`.
Outbound calls with timeouts, and retries or a circuit breaker where failure is expected.
`@Async` and scheduled work on named, bounded executors.
Actuator health and metrics enabled, exposed only on what should see them.

## Security

The filter chain declared explicitly: every route denied unless allowed. Authorisation at
the method (`@PreAuthorize`) for rules about who owns what, not only at the URL.
Passwords hashed with the delegating encoder's current default. CSRF protection on for
session-based browser apps; off only for stateless token APIs, deliberately.
CORS with named origins, never a wildcard with credentials. Uploads checked for size, type
and stored outside the web root. Dependencies scanned in the build.

## JPA

Associations lazy by default; fetched on purpose with a fetch join, an entity graph or a
projection, at the query that needs them. Open-session-in-view off.
`equals` and `hashCode` on a business key or the id with care, never on mutable
collections; no Lombok `@Data` on entities.
Projections (interfaces or records) for read paths; pagination with `Pageable`, and keyset
paging for deep lists.
Batch inserts and updates configured, not one statement per row. Optimistic locking with
`@Version` where two writers can meet.
Schema changes through the migration tool (Flyway or Liquibase), never `ddl-auto` beyond
`validate` outside local development.
The connection pool sized to the database's limit divided by the instances.

## Build

The wrapper script in the repository (`mvnw`, `gradlew`). Dependency versions through the
platform BOM, overridden only with a reason.
