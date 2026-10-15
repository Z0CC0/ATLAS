# Infrastructure as code — Terraform, OpenTofu, Pulumi, Bicep

Infrastructure code is applied to things that cost money and hold data; the loop is plan,
read, apply, verify, and the plan is read every time, including the tenth time today.
`guardrails.md` applies to every apply.

## Before touching the files

Which tool and version (`required_version`, the lock file), which state backend and where
its state lives (local state is a finding: it must be remote and locked before anyone else
works on it), which workspace or environment is selected (`terraform workspace show`, the
stack name): the wrong workspace is the wrong target. The provider versions pinned in the
lock file; an unpinned provider is a finding before any change.

## Writing it

One resource per logical thing, named for what it is, not for its order (`db_primary`, not
`aws_instance_3`). Variables with a type, a description and, when there is a sane one, a
default; secrets never in variables with defaults, never in the repository, never in the
state when the provider allows otherwise (and the state is treated as secret anyway).
Modules for what is repeated three times with the same shape, not for everything; a module
with twelve inputs is a program. Outputs for what another module or a person needs, with a
description. Tags or labels on everything that can carry them: owner, environment, the
repository that manages it, so a thing found in the console can be traced to its code.
`for_each` over a map rather than `count` over a list when items can be removed from the
middle: `count` renumbers and recreates. Data sources for what exists already, not
hard-coded identifiers.

## The plan

`terraform plan -out=plan.tfplan` (or the tool's equivalent), then the plan is read line by
line, and the three counts are said out loud: to add, to change, to destroy. A destroy that
the change did not intend is a stop: a renamed resource, a changed `for_each` key, a
provider upgrade that forces replacement. `terraform state mv` for a rename, before the
plan is re-run; `lifecycle { prevent_destroy = true }` on the resources whose loss is a
disaster (databases, buckets with data, key material). Applying the saved plan file, never a
fresh plan that could differ from the one read.

## After

The outputs checked against what the plan promised; the thing itself checked (the endpoint
answers, the instance is in the right subnet, the bucket policy denies public reads). The
state is in the backend, not in the working tree (`.terraform/`, `*.tfstate`, `*.tfplan` in
`.gitignore`). A drift check (`plan` with no changes expected) the next day when the
environment is shared, because someone clicks in consoles.

## Checks worth running

`terraform fmt -check` and `validate`; `tflint` with the provider rules; a policy scanner
(`checkov`, `tfsec`, `trivy config`) read for the findings that matter here (public
exposure, missing encryption, wide IAM), the rest noted; `terraform test` where the project
has tests. A pull request with infra changes carries the plan output, trimmed, in its body.
