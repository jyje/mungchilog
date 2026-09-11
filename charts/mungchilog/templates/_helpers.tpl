{{/*
Resolve the workload image reference.

The release contract is that a deployment names an immutable build: either a
semantic version tag published by the promotion workflow, or a digest. So the
chart default is Chart.appVersion - the workload version this chart revision
was tested against - and never a moving tag such as `latest`.

`image.digest` wins when set, because a digest is the only reference that
cannot be repointed after the fact. An explicitly provided `image.tag` is kept
alongside it (`repository:tag@digest`, which Kubernetes still resolves by
digest) so a human reading the manifest can see which build the digest is,
rather than losing that context. The appVersion fallback is deliberately not
injected next to a digest: it would name a version the digest may not be.
*/}}
{{- define "mungchilog.image" -}}
{{- $image := .Values.image -}}
{{- if $image.digest -}}
{{- if $image.tag -}}
{{- printf "%s:%s@%s" $image.repository $image.tag $image.digest -}}
{{- else -}}
{{- printf "%s@%s" $image.repository $image.digest -}}
{{- end -}}
{{- else -}}
{{- printf "%s:%s" $image.repository (default .Chart.AppVersion $image.tag) -}}
{{- end -}}
{{- end -}}
