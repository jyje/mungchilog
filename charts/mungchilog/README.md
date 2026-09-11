# Mungchilog Helm chart

Deploys the combined Mungchilog server and bundled web assets as a single
workload. The chart source lives in this repository; released charts are OCI
artifacts in `oci://ghcr.io/jyje/charts/mungchilog`.

## Versioning

The chart and the workload are released independently and carry two separate
version numbers.

| Field | Meaning | Bumped when |
| --- | --- | --- |
| `version` | This chart source's own semantic version | Any change under `charts/mungchilog/` |
| `appVersion` | The workload image tag, verbatim (`v` prefix included) | A new workload version becomes the tested default |

`appVersion` is the image tag as published, not a bare semantic version, so it
can be used directly as the default tag. A chart revision may be released
without a new workload, and a workload may be promoted without a new chart.

## Image reference

`image.tag` is empty by default and resolves to `appVersion`. `image.digest`
takes precedence when set, and an explicit `image.tag` is then kept alongside
it for readability - Kubernetes still resolves the digest.

| `image.tag` | `image.digest` | Rendered reference |
| --- | --- | --- |
| _(empty)_ | _(empty)_ | `ghcr.io/jyje/mungchilog:<appVersion>` |
| `v0.2.0` | _(empty)_ | `ghcr.io/jyje/mungchilog:v0.2.0` |
| _(empty)_ | `sha256:…` | `ghcr.io/jyje/mungchilog@sha256:…` |
| `v0.3.0` | `sha256:…` | `ghcr.io/jyje/mungchilog:v0.3.0@sha256:…` |

The promotion workflow publishes `v<major>.<minor>.<patch>` and
`v<version>-r<run>-<sha>`. It does not publish `latest`; the `latest` tag still
in the registry predates this release contract and must not be deployed. CI
fails a render that produces a moving tag.

## Install

```bash
helm install mungchilog oci://ghcr.io/jyje/charts/mungchilog \
  --version 0.3.0 \
  --namespace mungchilog --create-namespace \
  --set ingress.host=mungchilog.example.com
```

Pin a digest for a GitOps deployment:

```bash
helm upgrade mungchilog oci://ghcr.io/jyje/charts/mungchilog \
  --version 0.3.0 \
  --set image.digest=sha256:<64 hex characters>
```

The r4spi cluster instead lets Argo CD Image Updater own the tag: the
Application sets `image.tag: managed`, a sentinel that intentionally does not
exist in the registry, and Image Updater replaces it with a permitted
immutable tag through an Argo CD Helm parameter.

## Values

Only the values whose behavior is not obvious from `values.yaml` are listed
here. `values.schema.json` is authoritative for types.

| Key | Default | Notes |
| --- | --- | --- |
| `image.repository` | `ghcr.io/jyje/mungchilog` | Production package. Staging and development use `-stg` / `-dev` suffixed packages |
| `image.tag` | `""` | Empty resolves to `appVersion` |
| `image.digest` | `""` | `sha256:<64 hex>`; wins over `tag` |
| `replicaCount` | `1` | Must stay `1` while `locationSharing.enabled` |
| `locationSharing.enabled` | `false` | Coordinates live only in one process's memory. Enabling it forces the `Recreate` strategy so two pods never serve location traffic together. Configure it only here, never through `extraEnv` - the chart fails the render if you try |
| `database.provider` | `sqlite` | `sqlite` or `postgres`. SQLite is single-writer: do not raise `replicaCount` with it |
| `database.postgres.connectionMode` | `url` | `url` for a single `DB_POSTGRES_URL` key, or `components` for the five `DB_POSTGRES_*` keys |
| `database.postgres.existingSecret` | `""` | Required for `postgres`. Credentials are never chart values |
| `auth.initialAdmin.existingSecret` | `""` | The administrator email list is personal data and comes from a Secret |
| `persistence.enabled` | `true` | Backs `database.sqlite.path`. Required for SQLite durability |
| `usageMonitoring.googleCloud.enabled` | `false` | Google Cloud Monitoring read access. Uses workload identity federation, never a service-account key |
| `migration.spotTimeFields.enabled` | `false` | One-off data migration rendered as an Argo CD PreSync hook. An explicit operational action, not part of a routine sync. Supports `dryRun` |
| `extraEnv` / `extraEnvFrom` / `extraResources` | `[]` | Application settings and sealed secrets supplied by the deployment |

### Secrets

No secret value is ever a chart value. PostgreSQL credentials, OIDC client
secrets, Google Maps and NAVITIME API keys, and the initial administrator list
are all referenced from existing Secrets, supplied in this cluster as
SealedSecrets through `extraResources` and `extraEnvFrom`.

## Guard rails

The templates fail the render rather than producing a deployment that would
misbehave:

- `locationSharing.enabled` with `replicaCount` other than `1`
- `LOCATION_SHARING_*` set through `extraEnv`
- workload identity enabled without `usageMonitoring.googleCloud.enabled`
- workload identity enabled without a ServiceAccount to bind

## Upgrade and rollback

Chart and workload upgrade independently:

- **Workload only** - change `image.tag` or `image.digest`. On this cluster
  Image Updater does it after a promotion.
- **Chart only** - install a new chart `--version`, keeping the image pin.
- **Coordinated** - a new chart version whose `appVersion` names the new
  workload, for a change that needs both.

Roll back by reinstalling the previous chart version and the previous image
pin. Both are immutable, so a rollback is exact. Persistent data is not rolled
back: `persistence` keeps the SQLite volume across upgrades, and a data
migration Job is one-way unless its documentation says otherwise.
