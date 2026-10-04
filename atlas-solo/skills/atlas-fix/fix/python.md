# Python builds, type checks and startup errors

Commands, the project's own first (`make`, `tox`, `nox`, `pyproject` scripts). Defaults:
`python -m compileall -q <package>` for syntax, `mypy <package>` or `pyright`, `ruff check`,
`pytest -q --co` to see whether tests collect. Check the interpreter is the project's
(`which python`, the virtualenv) before believing any `ModuleNotFoundError`.

## Error, usual cause, right fix

`SyntaxError`, `IndentationError` — fix at the line before the one reported as often as at it.
`ModuleNotFoundError` — wrong environment, a missing `__init__.py`, a relative import run as a
script, or the package is not installed. The first three are fixes; the last is a stop.
`ImportError: cannot import name` — a circular import (move the import inside the function or
extract the shared part), a rename, or a version mismatch (stop).
`NameError`, `AttributeError: module has no attribute` at import — shadowing: a local file
named like a library (`random.py`, `json.py`).
mypy `Incompatible types in assignment / return value` — fix the annotation that lies or
convert the value; not `# type: ignore`, not `cast` to silence.
mypy `Item "None" of "Optional[X]" has no attribute` — add the `None` branch the type asks for.
mypy `Missing return statement`, `Function is missing a type annotation` — add it with the
real type.
mypy `Cannot find implementation or library stub` — stubs missing: a stop (`types-…` package),
unless the project already ignores that module in its config.
ruff/flake8 `F401` unused import, `F841` unused variable — remove; `E402` import not at top —
move it, unless it is deliberate after a path or env setup.
pytest collection: `fixture 'x' not found` (conftest in the wrong directory or a rename),
`import file mismatch` (stale `__pycache__`, two test files with one basename).

## Django

`ImproperlyConfigured` — the setting it names; `DJANGO_SETTINGS_MODULE` unset in the command.
`no such column`, `relation does not exist` — a migration not applied: `migrate` is a stop on
any database that is not a throwaway.
`Multiple leaf nodes in the migration graph` — `makemigrations --merge`, proposed.
`InconsistentMigrationHistory`, `Table already exists` — never `--fake` without asking.
`AppRegistryNotReady` — a model imported at module import time before `django.setup()`.

## PyTorch at run time

`mat1 and mat2 shapes cannot be multiplied` — print the shapes at the layer; fix
`in_features` or the flatten before it.
`Expected all tensors to be on the same device` — one tensor or the model missed `.to(device)`.
`CUDA out of memory` — batch size, or a tensor kept across iterations with its graph (a loss
appended without `.item()`); `empty_cache()` is not a fix.
`element 0 of tensors does not require grad` — a `.detach()`, `.item()` or `no_grad` upstream
of the loss.
`modified by an inplace operation` — replace the in-place op (`x += …`, `relu_(…)`) on a
tensor autograd still needs.
`index out of range in self` — an index at or above `num_embeddings`.

## Stops specific to this toolchain

`pip install`, `poetry add`, `uv add`, version pins, `migrate` on a real database, deleting
`__pycache__` outside the project, changing the Python version.
