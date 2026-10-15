# Go builds

Commands: `go build ./...`, then `go vet ./...`; `staticcheck ./...` or `golangci-lint run`
when the project has a config for it; `go test ./... -run xxx` compiles the tests without
running them.

## Error, usual cause, right fix

`undefined: X` — missing import, a typo, or the identifier is unexported in another package
(lowercase). Export it only if its package means it to be public; otherwise use the public
accessor.
`cannot use X (type A) as type B` — pointer versus value, or a named type versus its
underlying type. Take the address, dereference, or convert explicitly.
`X does not implement Y (missing method M)` — add the method; check the receiver: a pointer
receiver method is not in the value's method set.
`import cycle not allowed` — a stop when it needs a new package; otherwise move the shared
type to the package both already import.
`declared and not used`, `imported and not used` — remove it. Not `_ = x`.
`missing return` — a path through the function ends without one; add the return for that
path, usually the error case.
`multiple-value in single-value context` — the call returns an error too; handle it.
`assignment mismatch`, `too many arguments` — the callee changed; update the call.
`cannot assign to struct field m[k].f in map` — copy the value out, modify, write it back, or
store pointers.
`invalid operation: mismatched types` — convert explicitly; think about overflow when
narrowing.
`no required module provides package`, `missing go.sum entry` — `go get` / `go mod tidy`: a
stop, named.
`build constraints exclude all Go files` — a build tag or `GOOS`/`GOARCH` mismatch.
`vet`: `copylocks` (a struct with a mutex passed by value: pass a pointer), `lostcancel` (call
the cancel function), `printf` (verb and argument disagree), `unusedresult`.
Race detector report: two goroutines and one variable; the fix is a mutex, a channel or
confinement, not a `time.Sleep`.

## Stops specific to this toolchain

`go get`, `go mod tidy`, `replace` directives, changing the `go` version line, vendoring.
