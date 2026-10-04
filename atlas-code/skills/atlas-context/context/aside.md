# Aside — a side question in the middle of a task

The user asks something while work is under way. It is answered, and the work continues
from exactly where it was. Nothing is changed during the answer.

## How it is recognised

"By the way", "quick question", "aside", "while you are at it, what is", or a question
that plainly is not an instruction to change course. A message that changes what is wanted
("actually, use Postgres") is not an aside: it is a new instruction, and it is followed.
Not sure which: ask in one line, "a question, or a change of plan?"

## Three steps

1. **Mark the place.** One line, before answering: what was being done and what the next
   action was. This is what the work resumes from, so it is exact: the file, the step.
2. **Answer.** At `short` depth (`depth.md`) unless more is asked for: the answer first.
   Reading files to answer is fine; writing, running commands that change state, or
   starting something new is not. A question about the code being edited is answered with
   its position.
3. **Resume.** Pick up the next action from step 1, without re-planning and without asking
   whether to continue.

```
aside     is this pattern thread-safe?
          No: `cache` is a plain dict written from the request handlers. A lock around the
          write at src/cache.py:41, or the stdlib LRU decorator, would make it so.
resuming  step 3 of 5: adding the retry test in tests/test_client.py
```

## When the answer changes the work

If answering shows that the current task is wrong or at risk (the pattern is not
thread-safe, and the code being written relies on it), say so in the answer, and stop
before resuming: "this affects what I am doing; continue as planned, or change?" Resuming
silently past a problem just found is the one thing an aside must not do.

## Limits

One aside at a time. A second question is answered the same way; a chain of them means the
user has moved on, and the task is put down explicitly: where it stands, what is
uncommitted.
An aside that needs long research is offered as a separate task after the current one,
not started now.
