# Watching it run — dashboards, alerts, what to measure

A dashboard is an answer to questions someone asks at a bad moment. Start from the
questions, not from the metrics that happen to exist.

## The questions

Write them down first, for this service: is it up; are users being served, and how fast; is
anything failing, and for whom; is it about to run out of something; what changed just
before it went wrong. Each panel answers one of them or is not built.

## The minimum that earns its place

For anything that takes requests: **rate** (how many), **errors** (how many fail, as a
share), **duration** (how long, as a distribution: p50, p95, p99, never only the mean). Per
endpoint or operation where they differ.
For anything with limited resources: **saturation**: how full the thing is that will stop
the service when it fills: connections in the pool, queue depth and age of the oldest item,
disk, memory against its limit.
For anything that matters to the business: the one number that says the product works:
orders placed, jobs completed, messages delivered. It catches the failures that return 200.
Marks for deploys and config changes on every time axis: most incidents start at one.

Use the platform the project already has, and its existing naming and labels. Read the
schema of what is really emitted before writing a query; a panel on a metric that does not
exist is worse than no panel.

## Alerts

Alert on symptoms users feel, not on causes: error rate and latency over a threshold for
long enough to matter, the business number dropping, a queue's oldest item ageing. A CPU at
ninety percent with happy users is not a page.
Every alert says what is wrong, how bad, and where to look first; it links to the dashboard
and to the runbook step. An alert nobody acts on is removed or fixed: a channel of ignored
alerts hides the real one.
Thresholds from the service's own history, with a duration, so one slow minute does not
wake anyone.

## Cut

Panels nobody has looked at in an incident; averages of things that have tails; counters
with no rate; a wall of host metrics for a service whose problems are never the host; the
same graph in three places. A board that fits on one screen gets read.

## Logs and traces, in one line each

Logs: structured, with a request id carried across services, levels used honestly, no
secrets or personal data. Traces: on the paths where time is spent across services, sampled.

## Hand over

The dashboard and alert definitions as files in the repository when the platform supports
it, so they are reviewed and versioned. What was built, the questions it answers, and what
is still not observable, one line each. Applying them to a live monitoring system waits for
a yes.
