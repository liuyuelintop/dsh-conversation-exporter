# DSH Conversation Exporter

> **STATUS: V0.1 IMPLEMENTATION CANDIDATE — AWAITING EXACT-SHA ACCEPTANCE**

Export the current [DeepSeek Harness Web](http://127.0.0.1:3080) conversation into a clean,
human-readable Markdown file — for reading, storing in Git/notes, and attaching to
ChatGPT / Codex / Claude.

This project **does not replace** DSH's official raw Session ZIP export
(lossless/raw/debug/replay). This project is the clean/human-readable/AI-handoff layer.

## What exists now

A dependency-free DSH Web plugin with the production path:

```
current Session header action
  → sessionQuery.readSession(sessionId)
  → extract human messages + final assistant responses
  → render clean Markdown
  → same-origin response
  → browser Blob download
```

- `src/plugin.js` — native DSH host route over `sessionQuery` and `webServer`.
- `lib/client.js` — native additive `conversation.session.header.utilities` action.
- `src/lib/` — accepted extraction/rendering core and production boundary.
- `test/` — sanitized golden cases plus deterministic host/client integration tests.
- `src/cli.js` — JSONL test/debug entry point only.

The official **Session log** ZIP export stays present and unchanged. This plugin adds
**Export Chat** beside it for the current session only.

## Locked product defaults

- License: **MIT** (`LICENSE`)
- Download filename: `dsh-conversation-<session-id>.md`
- No provenance/session-metadata header in the Markdown
- Unanswered turns: neutral marker `> Response incomplete.` (no synthesized Assistant section)
- Image-only human messages: `[Image omitted]` placeholder

## Install into DSH Web

From this checkout:

```bash
dsh plugin --profile web add .
dsh web
```

Open a conversation and click **Export Chat**. The browser downloads
`dsh-conversation-<session-id>.md`.

## Verify and debug

```bash
npm run verify           # tests, syntax checks, package dry-run
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
| `docs/ARCHITECTURE.md` | Verified DSH runtime findings + production design |
| `docs/ACCEPTANCE.md` | Machine-testable acceptance criteria |
| `docs/AI_OPERATING_CONTRACT.md` | Autonomy limits for AI workers |
| `src/`, `lib/client.js` | Production plugin, accepted core, and debug CLI |
| `test/fixtures/`, `test/golden/` | Sanitized fixtures and exact expected outputs |

## Privacy

Everything runs locally. The pipeline never uploads anything, and the repository never
commits real conversation data — only hand-written, sanitized fixtures.

## License

MIT (locked default — see `LICENSE`).
