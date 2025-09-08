# Local Ops (kind, registry, TLS, Argo CD)
```
microservices-demo/                 # repo root
  env/local/...                     # Argo CD apps, Rollouts, AnalysisTemplates, etc.
  ops/local/
    kind/kind.yaml                  # ← your kind cluster config
    bin/
      registry-up.sh                # local Docker registry
      cluster-up.sh                 # kind up + registry wiring
      cluster-down.sh               # tear it all down
      mkcert-secret.sh              # import mkcert CA into cluster as secret
      install-cert-manager.sh       # one-time CRDs + chart (pre-argo)
      install-argocd.sh             # Argo CD via Helm (pre-argo)
      apply-root.sh                 # kubectl apply root Application (GitOps bootstrap)
      hosts-print.sh                # prints /etc/hosts entry after LB IP appears
    README.md                       # quickstart for humans
  .gitea/workflows/build-push.yaml  # CI (already added)
````

## Script permissions
- see current perms (likely "-rw-r--r--")
```
ls -l ops/local/bin/cluster-up.sh
```
- fix: mark all helper scripts executable
```
find ops/local/bin -type f -name "*.sh" -print0 | xargs -0 chmod +x
```

## Local-Only Setup Organization

To keep your repository clean and maintain a clear separation of concerns, organize your local-only setup files and commands as follows:

- **GitOps manifests:** Store all cluster state and application manifests under `env/local/**`.
- **Local bootstrap and operational scripts:** Place kind cluster configs and helper scripts in `ops/local/**`.
- **Continuous Integration:** Keep CI workflows in `.gitea/workflows/**`.

This structure provides:
- `source` (the original application code),
- `env` (declarative cluster state managed by GitOps),
- `ops` (machine-local setup and helper scripts).

---

## What the Setup Script Does

The provided setup script will:

1. Ensure a `registry:2` container is running on `localhost:5000`.
2. Create a kind cluster using `ops/local/kind/kind.yaml`.
3. Connect the registry container to the kind network.
4. (Optionally) Create the `local-registry-hosting` ConfigMap.
5. Print cluster information.

**Note:** Do **not** commit any keys or certificates. The scripts will read them from your machine (using `mkcert`) and create the necessary Kubernetes Secret.

---

## Recommended Run Order One-time (once per dev machine):

1. cluster & registry
./ops/local/bin/cluster-up.sh
2. cert-manager CRDs + chart (pre-Argo)
./ops/local/bin/install-cert-manager.sh
3. import mkcert CA into the cluster (creates secret 'mkcert-ca')
./ops/local/bin/mkcert-secret.sh
4. install Argo CD (controller/UI)
./ops/local/bin/install-argocd.sh
5. bootstrap Argo CD with your root Application (app-of-apps)
./ops/local/bin/apply-root.sh
6. after ingress is ready, get a /etc/hosts hint
./ops/local/bin/hosts-print.sh

After step 5, Argo CD will reconcile everything under env/local/apps/** (MetalLB, ingress-nginx, cert-issuer, monitoring, argo-rollouts, online-boutique, etc.).

## Visit
- https://boutique.local
 (app)
- https://grafana.local
 (Grafana)

## Tear down
- ./ops/local/bin/cluster-down.sh



---

## Why keep these *in repo*?

- They’re **deterministic** and **documented** alongside the manifests you’re practicing with.
- They don’t leak secrets (mkcert keys live on your Mac; we only *reference* them).
- New developers (or “future you”) can spin up the same local mini-cloud with a couple commands.

## What should *not* go in Git?

- Any **private keys**/cert material (e.g., mkcert files). Only the **command** to create the Kubernetes Secret belongs in Git.
- Your **/etc/hosts** changes (machine-local).

---

## Day-2 usage (canary/blue-green/rollback)

- Build & push a new frontend tag (commit → Gitea builds → pushes `localhost:5000/...:TAG`).
- Bump the image in `env/local/apps/online-boutique/rollout-frontend.yaml` and commit.
- Argo CD syncs; Argo Rollouts runs canary with Prometheus gate.
- Watch:
```bash
  kubectl argo rollouts get rollout frontend -n boutique
  kubectl argo rollouts dashboard -n boutique
```

Rollback: kubectl argo rollouts abort frontend -n boutique