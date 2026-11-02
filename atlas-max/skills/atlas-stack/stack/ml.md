# Machine learning — training, evaluation, serving; PyTorch

On top of `python.md`. What a reviewer will look for is in `atlas-review`'s `ml.md`; this
is how to write it so there is nothing to find.

## Before any model

Write down the decision the prediction feeds, what a wrong answer costs in each direction,
and the metric that follows from that. A baseline first: the rule in use today, or the
simplest model. A complex model is justified by beating it on the metric that matters, by
more than the noise.

## Into a codebase that has no model yet

The model sits behind one interface with a plain signature (features in, prediction out),
and the first implementation of that interface is the rule or heuristic in use today.
The application calls the interface and keeps working if the model is absent, slow or
wrong: a default, the old rule, or "no suggestion". Training code, notebooks and data
tooling live apart from the application and are not imported by it; only the artifact and
the shared preprocessing cross over.

## Data

One definition of an example: the entity, the moment of prediction, the label and when the
label becomes known. Features are computed only from what exists at the moment of
prediction.
Split before anything is fitted: by time when the data has an order, by group when one
entity has many rows. Three parts: train, validation for every choice, test opened once.
Datasets versioned and referred to by version. Schema, ranges and missing values checked
on the way in, in training and in serving, by the same code.

## Reproducible

A run is fully determined by code revision, configuration, data version and seed, and all
four are recorded with the metrics and the artifact. Seeds set for every library in use.
Training runs from a script with a config file; a notebook is for looking, not for
producing the model that ships.
One preprocessing implementation, saved with the model and loaded by serving.

## PyTorch

Device chosen once and passed down; tensors and modules moved to it explicitly; no
hard-coded `cuda`.
A module defines layers in `__init__` and computation in `forward`; shapes noted in
comments where dimensions change.
The loop, in order: `model.train()`, zero gradients, forward, loss, backward, optional
gradient clipping, optimiser step, scheduler step where it belongs. Evaluation under
`model.eval()` and `torch.no_grad()` or `inference_mode()`.
Accumulate metrics as Python numbers (`.item()`), not tensors that keep the graph alive.
`DataLoader`: workers and pinned memory tuned to the machine, shuffling only for training,
a seeded generator when order must be reproducible.
Checkpoints hold model, optimiser, scheduler, epoch and config; loaded with
`weights_only=True` unless the file is the project's own and trusted.
Mixed precision, compilation and gradient checkpointing are optimisations: added after
the plain loop is correct, each measured.

## Evaluation

Against the baseline and the model now in production, on the same data. Metrics by slice
as well as overall; the errors read by hand, grouped by cause. Thresholds chosen on
validation, from the costs written down at the start.
The criteria for promotion are stated before the run, and a run that does not meet them
does not ship.

## Serving

Input validated; the model version returned and logged with every prediction, with an id
that lets the outcome be joined later. A timeout and a fallback when the model cannot
answer. Rollout in steps (shadow, a small share, everyone), and the previous artifact kept
so rollback is a switch, not a retrain.
Watch inputs and predictions for drift, and quality once labels arrive, not only whether
the service is up.
