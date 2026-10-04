# Go

## Style

`gofmt` decides formatting; the standard library's style decides the rest. Short names in
short scopes, descriptive names for exported things; no stutter (`user.User`, not
`user.UserStruct`). Package names short, lower case, singular, saying what they provide.
A useful zero value where possible, so a type works without a constructor.
Return early on errors; the main path stays unindented.
Composition by embedding and small interfaces, not hierarchies.

## Errors

Returned, checked, never ignored. Wrapped with context on the way up
(`fmt.Errorf("loading config: %w", err)`): what this function was doing, not a repeat of
the callee's message.
Sentinel errors or typed errors for conditions callers branch on, tested with `errors.Is`
and `errors.As`. `panic` only for programmer errors that cannot be handled; never across a
package boundary.
Handle an error once: log it or return it, not both.

## Interfaces

Defined by the consumer, where they are used, with the one or two methods it needs. Accept
interfaces, return concrete types. No interface before there is a second implementation or
a test that needs one.

## Concurrency

`context.Context` as the first parameter of anything that blocks or calls out; cancellation
and deadlines flow through it; never stored in a struct.
Every goroutine has an owner and a way to stop; the function that starts it knows how it
ends. `errgroup` for a set of tasks that fail together; a bounded worker pool or a
semaphore for fan-out, never one goroutine per item without a limit.
Channels to pass ownership or signal; a mutex to guard shared state. The sender closes a
channel, never the receiver. Run tests with the race detector.
Graceful shutdown: catch the signal, cancel the root context, give in-flight work a
deadline, close resources.

## Layout

`cmd/<binary>/main.go` for entry points, small: read config, build dependencies, run.
`internal/` for everything not meant to be imported from outside. Packages by what they do
for the domain, not by technical layer names like `models` or `utils`.
Dependencies passed in through constructors; no package-level mutable state; `init` only
for things that cannot fail.

## Data and HTTP

Struct tags for encoding; unknown fields rejected where strictness matters. Pointers for
optional fields only where absence must differ from zero.
HTTP servers set read, write and idle timeouts; clients set a timeout and are reused, with
response bodies always closed. Handlers thin: decode, validate, call, encode.
Database access with context on every call, rows closed, transactions deferred to roll
back unless committed.

## Performance, when measured

Preallocate slices and maps of known size; `strings.Builder` for building strings; avoid
needless conversions between `string` and `[]byte`. Profile with `pprof` before changing
anything else; benchmarks with `-benchmem`.

## Tooling

`go vet` and the linter the project configures. `go mod tidy` leaves the module files
clean. Table-driven tests with subtests are the norm.
