# Java and Kotlin tests

Runner: `./gradlew test --tests 'pkg.ClassTest.method'` or `./mvnw -q test -Dtest=ClassTest#method`.
JUnit 5 unless the project is on 4; Kotlin projects may use Kotest. Write in what is there.

Files under `src/test/…` mirroring the package; class `ThingTest`.

## Java

`@Test` methods named for the behaviour; `@DisplayName` when the project uses it.
AssertJ (`assertThat(x).isEqualTo(y)`) when present, else JUnit assertions with a message.
Errors: `assertThrows(Type.class, () -> …)` and then assert on the message or fields.
Many inputs: `@ParameterizedTest` with `@CsvSource` / `@MethodSource`.
Mockito for collaborators at the boundary: `@Mock`, `@InjectMocks`, `verify` only for
interactions that are the behaviour. Not a mock of a value object.
Spring: the narrowest slice. `@WebMvcTest` for a controller with `MockMvc`; `@DataJpaTest` for
a repository; `@SpringBootTest` only for a flow across layers, it is slow.
Real dependencies through Testcontainers when the project has it; not an in-memory database
that behaves differently from production.
One test per permission on an endpoint: allowed, forbidden, unauthenticated.
Time: inject `Clock`.

## Kotlin

Backticked names: `` `returns 401 when the token expired` ``.
MockK (`every { … } returns …`, `coEvery` for suspend, `verify`) rather than Mockito on
Kotlin classes.
Coroutines: `runTest { }`, `StandardTestDispatcher`, `advanceUntilIdle()`; inject the
dispatcher; never `Thread.sleep` or `runBlocking` with delays.
`Flow`: Turbine (`flow.test { awaitItem() … }`) when present, else `toList()` on a bounded
flow.
Kotest: the spec style the project already uses, `shouldBe`, `shouldThrow<T>`, property
tests with `checkAll` for invariants.
Sealed results: one test per subtype the function can return.

## Not worth a test here

Getters, setters, Lombok or data-class generated members; a configuration class; a mapper
that copies fields one to one, unless a field is transformed.
