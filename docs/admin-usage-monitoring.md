# Administrator usage monitoring

The administrator page always shows application aggregates from the Mungchilog database. Google API request and latency metrics are optional and remain isolated from user approval if Cloud Monitoring is unavailable.

## What is collected

The server reads these Cloud Monitoring service runtime metrics for an administrator-selected 24-hour, 7-day, or 30-day window:

- request count by service and response code
- request error rate, where HTTP response codes 400 and above count as errors
- p50 and p95 request latency
- request count trend buckets

The default service allowlist covers Maps JavaScript API, Places API (New), Routes API, and Time Zone API. Cloud Monitoring can publish points up to about 30 minutes after a request. The UI displays the last sampled time and marks a longer delay explicitly.

Quota utilization is intentionally not shown as a numeric ratio yet. Google services expose quota metrics with service-specific units and rolling windows. A ratio without live validation could be misleading. Billing and cost data also remain out of scope until a controlled Cloud Billing export is available.

## Required Google Cloud access

Enable the Cloud Monitoring API (`monitoring.googleapis.com`) in the monitored project. Grant only `roles/monitoring.viewer` on that project to the application-specific Google identity. Do not grant Billing Viewer or a project editor role.

Mungchilog uses Application Default Credentials and supports Workload Identity Federation for a self-hosted Kubernetes cluster. Workload Identity Federation exchanges a projected Kubernetes ServiceAccount token for short-lived Google credentials, so no Google service account private key is stored in Kubernetes or Git.

Follow Google's [Kubernetes Workload Identity Federation guide](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-kubernetes) to create the pool, provider, attribute mapping, and IAM binding. Restrict the binding to the Mungchilog Kubernetes ServiceAccount subject rather than every principal in the pool.

## Generate the credential configuration

Generate an external-account configuration after the workload identity provider exists. Include `--service-account` when using service account impersonation, or omit it for direct resource access:

```sh
gcloud iam workload-identity-pools create-cred-config \
  projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID \
  --service-account=mungchilog-monitoring@PROJECT_ID.iam.gserviceaccount.com \
  --credential-source-file=/var/run/service-account/token \
  --credential-source-type=text \
  --output-file=credential-configuration.json
```

The generated JSON points the Google authentication library at the projected token file. It contains no private key and does not need a Kubernetes Secret or SealedSecret. Review it, then manage it as an ordinary GitOps ConfigMap or create it directly:

```sh
kubectl -n MUNGCHILOG_NAMESPACE create configmap mungchilog-google-wif \
  --from-file=credential-configuration.json \
  --dry-run=client -o yaml
```

Do not commit the output of `gcloud auth application-default login`, API keys, access tokens, or a Google service account key JSON file.

## Helm values

Configure the chart from the environment-specific GitOps repository. The audience should be the provider URL expected by the workload identity provider.

```yaml
serviceAccount:
  create: true
  name: mungchilog-monitoring
  automountServiceAccountToken: false

usageMonitoring:
  googleCloud:
    enabled: true
    projectId: PROJECT_ID
    monitoredServices:
      - maps-backend.googleapis.com
      - places.googleapis.com
      - routes.googleapis.com
      - timezone-backend.googleapis.com
    workloadIdentity:
      enabled: true
      audience: https://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
      credentialConfigMap: mungchilog-google-wif
      credentialConfigKey: credential-configuration.json
      tokenExpirationSeconds: 3600
```

The chart mounts the Kubernetes token at `/var/run/service-account/token`, mounts the ConfigMap at `/etc/workload-identity/credential-configuration.json`, and sets `GOOGLE_APPLICATION_CREDENTIALS` automatically.

For a cluster with another supported Application Default Credentials source, enable Google monitoring but leave `workloadIdentity.enabled` false. Never pass credentials through `extraEnv`.

## Local validation

Application aggregates require no Google configuration. To exercise Google monitoring locally, use a developer identity with Monitoring Viewer only, then enable the non-secret settings from `.env.sample`. The standard Google Application Default Credentials location is detected automatically.

Validate before a production rollout:

1. Confirm an administrator can switch between 24 hours, 7 days, and 30 days.
2. Compare one API's request count with the Google Cloud Monitoring console for the same project and time window.
3. Confirm p50 and p95 latency appear after latency data is available.
4. Remove or break the IAM binding temporarily in a non-production environment and confirm application aggregates still render with a provider error state.
5. Confirm a non-admin receives HTTP 403 from `/api/admin/usage`.
6. Inspect the Pod and verify no Google service account key Secret is mounted.

The server caches provider results for five minutes and coalesces concurrent requests. Browser responses use `Cache-Control: private, no-store` and do not expose provider error details or credentials.

## Rollback

Set `usageMonitoring.googleCloud.enabled` to `false` and sync the application. The administrator page will immediately return to its explicit disabled state while application aggregates and user administration continue to work. After the rollout completes, remove the workload identity IAM binding and the credential ConfigMap if no other workload uses them. No database rollback or user sign-out is required.
