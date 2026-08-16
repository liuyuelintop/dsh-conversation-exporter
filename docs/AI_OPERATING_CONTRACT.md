# AI Operating Contract — DSH Conversation Exporter

> **STATUS: DRAFT — NOT HUMAN ACCEPTED**

Repo-specific rules for AI work on this repository. General cross-project Harness
governance is not duplicated here; it still applies.

## Local-only processing

Conversation data is processed exclusively on the owner's machine. No uploads, telemetry,
analytics, cloud storage, or external services.

## Privacy-safe defaults

Exports exclude reasoning, tool calls/results, injections, runtime context, local
filesystem paths, and token accounting by default. Real conversation data is never
committed; committed fixtures must be hand-written and sanitized.

## DSH permission escalation

Never broaden DSH filesystem, network, or approval permissions without explicit human
consent. If DSH denies an operation, stop — do not route around the denial.

## Acceptance constraints

Never weaken or delete a failing acceptance test to obtain PASS. Diagnose → repair →
rerun, and report the repaired diff honestly.

## Exact-SHA rule

Human acceptance binds to one exact commit SHA. Any change after acceptance requires a
full verification re-run and a new recorded SHA.

## No push / no publish

Pushing, opening pull requests, or publishing packages requires explicit human approval.
