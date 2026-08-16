# DSH Conversation Exporter

> **STATUS: DRAFT — NOT HUMAN ACCEPTED** (Stage 0 architecture spike)

Export the current [DeepSeek Harness Web](http://127.0.0.1:3080) conversation into a clean,
human-readable Markdown file — for reading, storing in Git/notes, and attaching to
ChatGPT / Codex / Claude.

This project **does not replace** DSH's official raw Session ZIP export
(lossless/raw/debug/replay). This project is the clean/human-readable/AI-handoff layer.

## What exists right now (Stage 0)

A dependency-free Node.js spike that proves the core vertical path:

```
DSH session log (official raw artifact, JSONL)
  → identify human turns (source.kind === "user")
  → identify final assistant response per turn
  → clean canonical conversation (Human / Assistant only)
  → Markdown
  → file on disk (+ browser download mechanism demo)
```

- `src/` — pure extraction + Markdown rendering pipeline, plus a CLI.
- `test/` — deterministic regression tests (cases A–G) with sanitized fixtures and golden files.
- `demo/download-demo.html` — standalone proof of the browser-side local download mechanism.
- `docs/` — control plane: PRODUCT, ARCHITECTURE, ACCEPTANCE, AI_OPERATING_CONTRACT.

Runtime integration was also proven in the Stage 0 session: a host-only dynamic plugin
read the live session through the runtime `sessionQuery` service and fed this CLI
end-to-end (ephemeral, session-owned experiment; findings recorded in
`docs/ARCHITECTURE.md` F12–F14).

The JSONL artifact + CLI above is the **test/debug path**. The locked V0.1 production
architecture is `sessionQuery.readSession → extract → render → browser download`
(`docs/ARCHITECTURE.md`). V0.1 implementation has **not** started.

## Locked product defaults

- License: **MIT** (`LICENSE`)
- Download filename: `dsh-conversation-<session-id>.md`
- No provenance/session-metadata header in the Markdown
- Unanswered turns: neutral marker `> Response incomplete.` (no synthesized Assistant section)
- Image-only human messages: `[Image omitted]` placeholder

## Quick start

```bash
npm test                 # deterministic regression tests (node --test, zero deps)
npm run check            # syntax check every JS file
node src/cli.js test/fixtures/a-normal-chat.jsonl
```

With an official DSH session artifact (including `.jsonl.zstd`, if the `zstd` CLI is on PATH):

```bash
node src/cli.js /path/to/session.jsonl.zstd conversation.md
```

## Repository map

| Path | Purpose |
|---|---|
| `docs/PRODUCT.md` | Problem, target user, V0.1 outcome, non-goals |
| `docs/ARCHITECTURE.md` | Verified DSH runtime findings + spike design |
| `docs/ACCEPTANCE.md` | Machine-testable acceptance criteria |
| `docs/AI_OPERATING_CONTRACT.md` | Autonomy limits for AI workers |
| `src/` | Spike pipeline + CLI (dependency-free) |
| `test/fixtures/`, `test/golden/` | Sanitized fixtures and exact expected outputs |

## Privacy

Everything runs locally. The pipeline never uploads anything, and the repository never
commits real conversation data — only hand-written, sanitized fixtures.

## License

MIT (locked default — see `LICENSE`).
