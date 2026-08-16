# AI Operating Contract — DSH Conversation Exporter

> **STATUS: DRAFT — NOT HUMAN ACCEPTED**

Rules for autonomous AI work on this repository. Chat messages are not authoritative
project state; the repository is.

## AI may decide (reversible, in-scope)

- Implementation details inside `src/`, `test/`, `demo/` that keep the documented
  deterministic rules and the product objective unchanged.
- Wording and structure of these draft documents (they remain DRAFT until human acceptance).
- Creating sanitized fixtures and running local, deterministic verification.
- Making local Git commits on this repository's branch.

## AI must escalate (stop and ask a human)

1. Any change to the product objective (clean Markdown export of the current DSH
   conversation; never the raw forensic export).
2. A verified finding that DSH APIs make the architecture fundamentally invalid.
3. Need for broader filesystem/network/security permissions.
4. Acceptance requirements that contradict each other.
5. Any destructive or externally visible action.
6. Repeated self-remediation that cannot produce a trustworthy result.
7. Pushing to GitHub, opening PRs, publishing to npm, or creating external services —
   **never without explicit human approval**.

## Verification requirements

- Every architecture claim must carry a source/runtime citation (see
  `docs/ARCHITECTURE.md`); unverified claims live only in the "Open questions" sections.
- All acceptance cases A–G must pass deterministically before any report of readiness.
- Never weaken or delete a failing acceptance test to obtain PASS. Diagnose → repair →
  rerun; report the repaired diff honestly.
- No telemetry, analytics, upload, or cloud storage may be introduced.

## Exact-SHA acceptance

Human acceptance binds to one exact commit SHA. Post-acceptance changes require a fresh
full verification run and a new SHA. The SHA is reported in the handoff, never implied.

## Privacy & security

- Process conversation data only locally, on the owner's machine.
- Never commit real conversation content; only hand-written sanitized fixtures.
- By default the export must not expose reasoning, tool results, runtime context,
  injections, local filesystem paths, or token accounting.
