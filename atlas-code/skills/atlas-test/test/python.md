# Python tests

Runner: `pytest` when there is a `pytest.ini`, `pyproject` section, `conftest.py` or
`test_*.py` files written as functions; `unittest` when the existing tests are classes
inheriting `TestCase`. Write in the style already there. Run one test:
`pytest path::test_name -q`.

Files `tests/test_<module>.py`; functions `test_<behaviour>`; the name is the sentence.

## Idioms

Plain `assert`; pytest rewrites it into a useful message.
Errors: `with pytest.raises(ValueError, match="…")`; assert the type and the message.
Many inputs, one behaviour: `@pytest.mark.parametrize`, with `ids` when the values are not
self-describing.
Fixtures for setup that several tests share; the narrowest scope that works; a fixture that
does more than build one thing is hiding a test's meaning.
`tmp_path` for files, `monkeypatch` for env and attributes, `capsys` for output; never the
real home directory or real env.
Time: inject the clock or use `freezegun`/`time-machine` if the project has it; no `sleep`.
Network: `responses`, `respx`, `httpx.MockTransport`, or the project's fake; not a patch of
`requests.get` returning a hand-built object for each call.
`unittest.mock.patch` where the name is looked up, not where it is defined; `autospec=True`
so a wrong signature fails.
Async: `pytest-asyncio` or `anyio` as the project has; `await` everything.
Floats: `pytest.approx`.

## Django

`pytest-django` when present: `@pytest.mark.django_db`, the `client` fixture, factories
(`factory_boy`) rather than fixtures files. Assert the response status, the content that
matters and the database state. One test per permission: allowed, denied, anonymous.
Migrations: a test that the migration applies and reverses when the diff adds one with data
movement.

## FastAPI

`TestClient` (or `httpx.AsyncClient` for async); override dependencies with
`app.dependency_overrides`, restored after. Assert the status, the body schema, and the
validation error on a bad body.

## Not worth a test here

A dataclass with no behaviour; a constant; a thin wrapper that only forwards arguments.
