# Kubernetes — manifests, Helm charts, a rollout

Read what the cluster and the repository already use: plain manifests, Kustomize, Helm, a
GitOps controller. Work in that. With GitOps, the change is a commit to the repository the
controller watches, never a direct apply.

## A workload that behaves

**Resources.** Requests on every container, sized from what it really uses; a memory limit;
a CPU limit only when the cluster's policy wants one. No requests means the scheduler is
guessing and the pod is first to be evicted.
**Probes, three different questions.** Startup: has it finished booting; gives slow starters
time without loosening the others. Readiness: can it take traffic now; fails when a
dependency it needs is down, and the pod is taken out of the service, not killed. Liveness:
is it stuck beyond recovery; restarts the pod, so it must not depend on anything outside the
process, or one database blip restarts everything.
**Rollout.** A rolling update with a surge and an unavailability the capacity can bear;
`minReadySeconds` so a pod that crashes after ten seconds does not count as ready; a
disruption budget so a node drain cannot take every replica; more than one replica, spread
across nodes, for anything that must stay up.
**Shutdown.** The application handles the termination signal and finishes in-flight
requests; a `preStop` pause when the load balancer needs time to stop sending; a grace
period longer than the longest request.
**Configuration and secrets.** Config in a ConfigMap, secrets in a Secret or from an
external store, both referenced, neither baked into the image. A change to either rolls the
pods, by a checksum annotation or the tool's own mechanism.
**Least privilege.** A service account per workload with only the permissions it uses; not
the default one; no cluster-admin. Run as non-root, no privilege escalation, a read-only
root filesystem where possible, capabilities dropped. Network policies when the cluster
enforces them: who may call this, whom may this call.
**Images** by tag that is never reused, or by digest; never `latest`.

## Before applying

Render it (`helm template`, `kustomize build`) and read the result. Validate against the
cluster's version. `kubectl diff` against the live state: the diff is what is shown for the
yes, with the context and namespace named. A context that is production is said in words.

## After

`kubectl rollout status` to completion; pods ready and not restarting; the events of the
namespace for warnings; the service answering through its real entry point. A rollout that
stalls is rolled back (`kubectl rollout undo`, or reverting the commit under GitOps) after a
yes, with the reason from the pod's events and logs quoted exactly.

## Never without a yes

`apply`, `delete`, `scale`, `rollout undo`, `helm upgrade` or `rollback`, any change to
RBAC, namespaces, or cluster-scoped resources. Never at all from here: reading the contents
of a Secret into the conversation.
