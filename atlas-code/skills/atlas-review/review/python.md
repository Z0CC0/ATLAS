# Python — .py

Checks to run when the project has them, before reading: `ruff check`, `mypy` on the changed
files, `pytest -q` when the diff touches tests or the code they cover. A failure is the first
line of the review.

## breaks

f-string, `%` or `+` building SQL, a shell command, an LDAP or XPath query from input;
`subprocess` with `shell=True` and input in the string; `os.system`.
`eval`, `exec`, `pickle.load`, `yaml.load` without `SafeLoader`, `marshal` on data from
outside.
A user-controlled path opened without `os.path.realpath` and a prefix check; `..` accepted.
`except:` or `except Exception: pass` around code whose failure changes a result.
Mutable default argument (`def f(items=[])`) when the function mutates it.
`is` used to compare values (`x is 0`, `s is ""`); `==` used against `None` in a place where
`__eq__` is overridden.
Shared mutable state touched from threads without a lock; blocking I/O or `time.sleep` inside
an `async def`; an `await` missing on a coroutine, so it never runs.
Secret in source, in a log line, in an exception message returned to the client.
A resource opened without `with` on a path that can raise before `close()`.

## fragile

Public function without type hints where the caller would otherwise guess; `Any` where the
type is known; `Optional` missing on a parameter that accepts `None`.
`dict[...]` access on external data without `.get` or a schema; `int()`/`float()` on input
without the `ValueError` branch.
`from module import *`; shadowing a builtin (`list`, `id`, `type`, `input`) in a scope wider
than a comprehension.
String concatenation in a loop building a large text: `"".join`.
Django: a related object touched in a loop without `select_related`/`prefetch_related`;
multi-step writes outside `transaction.atomic()`; `.get()` without the `DoesNotExist` branch;
a model change with no migration (`makemigrations --check`); `fields = "__all__"` on a
serializer that touches a sensitive column; a list endpoint without pagination; `@csrf_exempt`
without a reason; `mark_safe` on input.
FastAPI: a blocking call inside an `async` route; a request body without a Pydantic model;
`response_model` missing where the ORM object has fields the client must not see; CORS set to
`*` with credentials.
Flask: no error handlers, CSRF absent on forms.

## unclear

`print` where the module uses `logging`; a function above five parameters that are always
passed together (a dataclass is the fix); a comparison `type(x) == T` where `isinstance` reads
the intent.

## Not findings here

PEP 8 spacing and import order; missing docstrings on private functions; a list comprehension
written as a loop; line length.
