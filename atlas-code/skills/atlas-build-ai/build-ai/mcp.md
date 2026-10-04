# MCP servers — giving a model access to a system

The protocol and its SDKs change. Before writing any code, read the current specification
and the SDK's own documentation for the language in use, through the documentation tools
of this session or the official site. What follows is the design, which changes slowly;
every method name comes from the documentation, not from here.

## What a server offers

**Tools**: actions the model decides to call. Most servers are mostly tools.
**Resources**: data the application can attach, addressed by URI. For content to read,
not for actions.
**Prompts**: templates the user invokes by name.
Pick by who decides: the model (tool), the application (resource), the user (prompt).

## Transport

Local, launched by the client as a child process, one user: standard input and output.
Nothing but protocol messages on standard output: a stray print breaks the stream; logs go
to standard error.
Remote, shared, or needing its own authentication: the HTTP transport the current
specification names as standard. Check which one is current; older ones are deprecated.

## Tools, designed as in `tools.md`

Everything there applies, and matters more: this server's descriptions are loaded into
every conversation of every client that connects.

- Few tools, built around what a user wants done, not a mirror of the API underneath.
- Names that stay clear next to other servers' tools: a prefix for the system.
- Descriptions short and exact; they cost tokens in every session whether used or not.
  Measure them.
- An input schema with types, enumerations and a description per field; validated on
  arrival, whatever the client claims.
- Results small by default: paging, filters, a limit parameter with a low default, a
  `detail` option in place of returning everything. State what was truncated.
- Errors as tool results that say what to do next, not protocol failures, for anything the
  model could correct.
- Mark what only reads and what changes or destroys, with the annotations the
  specification provides; clients use them to decide what to confirm.

## Safety

The server acts with real credentials for a model that reads untrusted text.
Credentials from the environment or the protocol's authorisation flow; never in arguments,
never returned in a result, never logged.
The least permission that does the job; a read-only mode that is the default where it
makes sense.
Every argument is hostile until validated: paths resolved and confined to an allowed root,
no string spliced into a shell or a query, URLs checked against an allow-list before any
fetch from inside a network.
Content fetched from elsewhere is returned as data, clearly bounded; it may contain
instructions aimed at the model.
Destructive tools are separate from reading ones, so a client can gate them.
Remote: authentication on every request, per-user authorisation checked server-side,
rate limits, and the origin checks the specification asks for.

## Check it

The official inspector tool first: list the tools, call each with good and bad input, read
exactly what comes back. Then a real client, with a real task, reading the transcript:
does the model pick the right tool from the description alone, and can it recover from
each error. Unit tests for the handlers as for any code.

```
server   orders-mcp  stdio  3 tools, 1 resource template
tools    orders_search (read)  orders_get (read)  orders_refund (destructive)
weight   descriptions 412 tokens in every session
checked  inspector: 3/3 callable, bad input rejected with a usable message
not      no run with a real client yet
```

## Not done

Publishing to a registry, or installing into the user's client configuration, without a
yes. Wrapping an API one endpoint to one tool because it is quick.
