# C# tests

Runner: `dotnet test --filter "FullyQualifiedName~Namespace.ClassTests.Method"`. xUnit, NUnit
or MSTest: the one the test project references. Assertions library as the project has
(FluentAssertions, Shouldly, or the framework's own).

A test project per source project, `Thing.Tests`; class `ThingTests`; method
`Method_Condition_Outcome` or a sentence, as the existing tests do.

## Idioms (xUnit; the others map one to one)

`[Fact]` for one case, `[Theory]` with `[InlineData]` / `[MemberData]` for many.
Arrange, act, assert, separated by a blank line; one act per test.
Errors: `await Assert.ThrowsAsync<InvalidOperationException>(() => sut.DoAsync())`, then
assert the message or a property.
Async tests return `Task`, never `async void`; `await` everything; no `.Result`.
Collaborators through interfaces in the constructor; Moq or NSubstitute as the project has;
`Verify` only for interactions that are the behaviour.
The class under test built in the test or in the constructor; shared expensive context with
`IClassFixture<T>`; no static state between tests, xUnit runs classes in parallel.
Time through `TimeProvider` or an injected clock; `Guid`s injected when asserted on.
EF Core: SQLite in-memory or Testcontainers rather than the in-memory provider, which does
not enforce constraints.
ASP.NET Core: `WebApplicationFactory<Program>` with services replaced in
`ConfigureTestServices`; assert status, body and the database; one test per authorisation
outcome.
`CancellationToken`: one test that cancellation is honoured where the method takes one.

## Not worth a test here

Auto-properties; records with no logic; a DI registration extension; a DTO mapping that
copies fields unchanged.
