# Swift tests

Runner: `swift test --filter TargetTests.ClassTests/testName` for a package;
`xcodebuild test -scheme <S> -destination '<simulator>' -only-testing:Target/Class/test` for a
project. Swift Testing (`import Testing`, `@Test`, `#expect`) when the project already uses
it; XCTest otherwise. Do not mix within one file.

Files in the test target mirroring the source; `@testable import Module` for internals.

## XCTest

`func test_behaviour_whenCondition()`; `XCTAssertEqual(got, want)`, with a message when the
values alone would not explain the failure.
Errors: `XCTAssertThrowsError(try f()) { error in XCTAssertEqual(error as? MyError, .notFound) }`.
Optionals: `let value = try XCTUnwrap(optional)`, not `!`.
Async: `func test…() async throws`; `await` directly. Callbacks: `XCTestExpectation` with
`fulfill` and `await fulfillment(of:timeout:)`; a short timeout, never a sleep.
`setUp`/`tearDown` kept small; `addTeardownBlock` for one-off cleanup.

## Swift Testing

`@Test("returns 401 when the token expired")`; `#expect(a == b)`; `#require` to unwrap or stop;
`@Test(arguments: […])` for many inputs; `@Suite` to group; `#expect(throws: MyError.self) { … }`.

## Both

Dependencies through protocols passed in the initialiser; a struct or final class fake in the
test target. The network through a `URLProtocol` stub or an injected client, never the real
host. Time and UUIDs injected.
`@MainActor` on tests that touch UI-bound types.
Actors: assert through their async interface; do not reach around isolation.
Combine: collect with a sink into an array under an expectation, or use the async `values`.
SwiftUI views: test the view model; views themselves through UI tests or snapshot tests only
if the project has them.
UI tests (`XCUIApplication`): few, by accessibility identifier, for the flows that matter.

## Not worth a test here

`Codable` synthesised conformance with no custom keys; a view that only arranges subviews;
an extension that forwards to the system.
