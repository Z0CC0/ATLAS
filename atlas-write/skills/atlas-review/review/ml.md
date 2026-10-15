# Machine learning — when the diff trains, evaluates or serves a model

On top of `python.md`. Chosen by import (`torch`, `tensorflow`, `keras`, `jax`, `sklearn`,
`xgboost`, `lightgbm`, `catboost`, `transformers`) or by what the file does: builds
features, splits data, fits, scores, loads an artifact, serves predictions.

The failures here do not crash. The pipeline is green and the model is wrong, so a `breaks`
line names the path by which a wrong number reaches a decision.

## breaks

**Leakage.** A feature computed from something not known at prediction time: the label
itself, a field written after the outcome, an aggregate that includes the row's own future.
A join that is not as-of the prediction timestamp.
A scaler, encoder, imputer, vocabulary or feature selection fitted on all the data before
the split: `fit` on train only, `transform` on the rest; inside a `Pipeline` when
cross-validating.
**Split.** A random split on data ordered in time, or with several rows per user, patient,
session or document: the same entity on both sides. Split by time or by group.
Duplicates across train and test. The test set used to choose a threshold, a
hyperparameter or a checkpoint: that is the validation set's job, and the reported number
is no longer a test.
**Train and serve disagree.** Preprocessing written twice, once for training and once for
inference; a different tokenizer, normalisation constant, category order, image size,
feature order or default for missing values. One shared function or artifact, or a test
that proves equivalence.
A model loaded without `eval()` at inference in PyTorch (dropout and batch norm still in
training mode); gradients tracked at inference with nobody needing them.
**Loading.** `pickle`, `joblib` or `torch.load` without `weights_only=True` on a file that
came from outside: it runs code. An artifact overwritten in place with no version.
**Metric.** Accuracy reported on classes that are far from balanced; a metric averaged
over batches of unequal size; a loss reported as if it were the metric; an improvement
with no baseline beside it.
**Data.** Labels and features joined on a key that is not unique, so rows multiply; rows
dropped by an inner join or a `dropna` with no count; personal or secret data written into
a dataset, a notebook output, a log or an artifact.

## fragile

No seed, or a seed set for one library and not the others; results that cannot be
regenerated from code, config, data version and seed alone.
Training that depends on notebook state or cell order.
A threshold, a class weight, a learning rate as a bare literal with no record of how it
was chosen.
Evaluation on the aggregate only, where a slice that matters (a cohort, a language, new
users, the rare class) can fall while the average rises.
Serving with no check of the input: missing, stale or out-of-range features scored as if
valid; no timeout, no fallback when the model is unavailable.
Predictions logged without the model version, or without an id to join them to the
outcome later.
A promotion that depends on someone reading a chart; a rollback that needs a retrain.
Tensors moved between devices inside a loop; a `DataLoader` with shuffling on for
evaluation; mixed precision or `non-deterministic` settings changed without the reason.
`fit_transform` called again at inference; `predict` on a frame whose columns are in
another order than at fit.
Monitoring that covers uptime and nothing about the inputs or the predictions drifting.

## unclear

A dataset, a split or an experiment with no name or version to refer to it by; a metric
whose direction (higher or lower is better) is not said; shapes and units not stated where
tensors change dimension; a magic number that is a property of the data.

## ask

Whether a field exists at prediction time: only the author knows how the data arrives.
What a wrong prediction costs in each direction: it decides whether the metric and the
threshold are the right ones.

## Not findings here

The choice of model family or framework; hyperparameter values that a search produced; a
notebook used for exploration and not for production; code style inside generated or
exported cells.

## Notebooks

Review the code cells of the diff; ignore outputs except for what they leak (data, keys,
paths). `git diff` on `.ipynb` is noisy: read the cells' source, not the JSON.
