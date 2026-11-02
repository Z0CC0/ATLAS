# Go tests

Runner: `go test ./...`; one test `go test ./pkg -run 'TestName/subcase' -v`; `-race` whenever
goroutines are involved; `-count=1` to defeat the cache when checking for flakiness.

Files `x_test.go` beside `x.go`; package `x` for internals, `x_test` to test the public
surface as a caller would. Functions `TestThing`.

## Idioms

Table-driven: a slice of structs with `name`, inputs, `want`, `wantErr`; `t.Run(tc.name, …)`
so each case reports by name and can be run alone. One table per behaviour, not one giant
table for the whole function.
Fail with what was got and what was wanted: `t.Errorf("Parse(%q) = %v, want %v", in, got,
want)`. `t.Fatalf` only when continuing makes no sense.
Errors: `errors.Is` / `errors.As` against the sentinel or type; not string comparison of the
message.
Compare structs with `cmp.Diff` (`go-cmp`) when the project has it; else field by field. Not
`reflect.DeepEqual` on types with unexported or time fields.
`t.Helper()` in helpers so the failure points at the caller.
`t.TempDir()`, `t.Setenv()`, `t.Cleanup()`; never the real filesystem or env.
`t.Parallel()` only when the test shares nothing; with a table, capture the loop variable on
Go versions before 1.22.
Interfaces at the boundary, small and defined by the consumer; a hand-written fake beats a
mocking framework for two methods.
HTTP: `httptest.NewServer` for clients, `httptest.NewRecorder` for handlers.
Time: pass a clock; no `time.Sleep` to wait for a goroutine, use a channel or `sync.WaitGroup`.
Fuzz (`func FuzzX`) for parsers and decoders; benchmark only when the request is about speed.
Example functions (`ExampleX`) where the output documents the API.

## Not worth a test here

Generated code; a `String()` method; a constructor that only assigns fields.
