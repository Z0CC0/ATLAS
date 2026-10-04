# Go — .go

Checks to run before reading: `go vet ./...`, `go build ./...`; `staticcheck` or
`golangci-lint run` when present; `go test -race` on the changed packages when the diff
touches goroutines. A failure is the first line of the review.

## breaks

An error assigned to `_`, or a call whose error return is dropped entirely.
`err == target` where the error may be wrapped: `errors.Is`; a type assertion on an error
where `errors.As` is needed.
String concatenation into `database/sql`, `os/exec` with input in the argument string, a path
from input without `filepath.Clean` and a prefix check.
Shared memory written from more than one goroutine with no mutex, channel or atomic.
A goroutine started with no way to stop it: no `context.Context`, no done channel; a send on an
unbuffered channel with no receiver on any path; `sync.WaitGroup` with `Add` after `Go`.
`panic` for a condition the caller could handle; a `recover` that swallows the panic and
continues with half-initialised state.
`InsecureSkipVerify: true`; `unsafe` without the reason beside it; a secret in source.
`defer` inside a loop that holds a file, lock or connection until the function returns.

## fragile

`return err` with no `fmt.Errorf("doing x: %w", err)`: the caller gets a message with no place.
A mutex locked without `defer mu.Unlock()` on a path that can return early.
Package-level mutable variables used as state.
A `context.Context` not first in the parameter list, or stored in a struct.
HTTP client or `net.Dial` without a timeout; `http.Get` with the default client in server code.
Slice appended in a loop with the length known in advance: `make([]T, 0, n)`; string built in a
loop: `strings.Builder`.
A method with a value receiver that mutates a field.
An interface defined with one implementation and one caller: it hides nothing and costs a
file.

## unclear

`if err != nil { … } else { … }` where the early return reads straight.
Error strings capitalised or ending with punctuation, when the rest of the package follows
the convention.
Package named with an underscore or a plural when the module does not.

## Not findings here

Function length; table-driven tests absent on a one-case test; comment on every exported
identifier when the package is internal.
