{{/*
Expand the name of the chart.
*/}}
{{- define "retrofitlink.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "retrofitlink.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "retrofitlink.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "retrofitlink.labels" -}}
helm.sh/chart: {{ include "retrofitlink.chart" . }}
{{ include "retrofitlink.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "retrofitlink.selectorLabels" -}}
app.kubernetes.io/name: {{ include "retrofitlink.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-specific labels
*/}}
{{- define "retrofitlink.componentLabels" -}}
{{- $component := .component -}}
{{- $context := .context -}}
{{ include "retrofitlink.labels" $context }}
app.kubernetes.io/component: {{ $component }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "retrofitlink.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "retrofitlink.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the backend service
*/}}
{{- define "retrofitlink.backend.fullname" -}}
{{- printf "%s-backend" (include "retrofitlink.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create the name of the frontend service
*/}}
{{- define "retrofitlink.frontend.fullname" -}}
{{- printf "%s-frontend" (include "retrofitlink.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create the name of the blockchain service
*/}}
{{- define "retrofitlink.blockchain.fullname" -}}
{{- printf "%s-blockchain" (include "retrofitlink.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create the name of the iot-simulator service
*/}}
{{- define "retrofitlink.iot-simulator.fullname" -}}
{{- printf "%s-iot-simulator" (include "retrofitlink.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Generate certificates secret name
*/}}
{{- define "retrofitlink.certificateSecretName" -}}
{{- printf "%s-tls" (include "retrofitlink.fullname" .) -}}
{{- end }}

{{/*
Generate app secrets name
*/}}
{{- define "retrofitlink.appSecretsName" -}}
{{- printf "%s-secrets" (include "retrofitlink.fullname" .) -}}
{{- end }}

{{/*
Generate environment variables for backend
*/}}
{{- define "retrofitlink.backend.env" -}}
- name: NODE_ENV
  value: {{ .Values.global.environment | quote }}
- name: PORT
  value: "5000"
- name: LOG_LEVEL
  value: {{ .Values.backend.env.LOG_LEVEL | quote }}
- name: RATE_LIMIT_WINDOW_MS
  value: {{ .Values.backend.env.RATE_LIMIT_WINDOW_MS | quote }}
- name: RATE_LIMIT_MAX_REQUESTS
  value: {{ .Values.backend.env.RATE_LIMIT_MAX_REQUESTS | quote }}
{{- range .Values.backend.secrets }}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ .valueFrom.secretKeyRef.name }}
      key: {{ .valueFrom.secretKeyRef.key }}
{{- end }}
{{- end }}

{{/*
Generate environment variables for frontend
*/}}
{{- define "retrofitlink.frontend.env" -}}
- name: REACT_APP_ENV
  value: {{ .Values.frontend.env.REACT_APP_ENV | quote }}
{{- range .Values.frontend.secrets }}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ .valueFrom.secretKeyRef.name }}
      key: {{ .valueFrom.secretKeyRef.key }}
{{- end }}
{{- end }}

{{/*
Generate resource limits and requests
*/}}
{{- define "retrofitlink.resources" -}}
{{- if .resources }}
resources:
  {{- if .resources.limits }}
  limits:
    {{- if .resources.limits.cpu }}
    cpu: {{ .resources.limits.cpu }}
    {{- end }}
    {{- if .resources.limits.memory }}
    memory: {{ .resources.limits.memory }}
    {{- end }}
  {{- end }}
  {{- if .resources.requests }}
  requests:
    {{- if .resources.requests.cpu }}
    cpu: {{ .resources.requests.cpu }}
    {{- end }}
    {{- if .resources.requests.memory }}
    memory: {{ .resources.requests.memory }}
    {{- end }}
  {{- end }}
{{- end }}
{{- end }}
