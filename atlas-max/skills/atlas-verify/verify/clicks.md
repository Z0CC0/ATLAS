# What a button really does — when the request says buttons, click path, handlers, UI state

A class of bug that tests and type checks miss: every function in a handler works alone, and
together they leave the screen in a state the label did not promise. One call sets a mode,
the next resets it as a side effect. Found by tracing, not by running.

## Scope

The component, page or feature the request names. A whole application is done area by area;
say which area is covered and which is left.

## Step one: what each state action touches

List the stores, contexts, reducers or signals in the area. For each action or setter: the
state it writes, and the state it writes besides the one in its name. `selectThread(null)`
that also clears the compose flag is the kind of line this step exists to find. Keep the list;
the next step reads from it.

## Step two: each thing a user can press, submit or change

For every handler, in the order the calls are written:
what it reads, what it writes, what it resets on the way;
whether a later call undoes an earlier one;
whether an `await` sits between two writes, and what the user can do during it (press again,
navigate, type) and what a slow or failed response leaves behind;
whether the state at the end is what the label, the icon or the surrounding text promises.

Also: a handler attached to nothing or attached twice; a disabled control that is still
reachable by keyboard; a form whose submit and whose button `onClick` both fire; optimistic
updates with no undo on failure.

## Report

One line per finding, in the form of a review line:

`<file>:<line>  <tier>  <label of the control>: <what the user ends with>, promised <what>. <cause: which call undoes which>. <the fix>.`

`breaks` when the action visibly does not happen or happens twice; `fragile` when it depends
on timing; `unclear` when it works and the code hides why. Then the count of controls traced
and of those with nothing found. `nothing found` when that is the result.
