# Acceptance — DSH Conversation Exporter

> **STATUS: V0.1 CANDIDATE AWAITING EXACT-SHA ACCEPTANCE**

## Core invariant

> Clean export contains exactly the human-authored conversation and the final assistant
> answers intended for a human-readable handoff — nothing else.

## Machine-testable criteria

All criteria are deterministic and runnable. Golden files are exact-string comparisons;
there is no tolerance for drift. `npm test` runs every case.

| # | Case | Fixture | PASS condition |
|---|---|---|---|
| A | Normal user → assistant chat (2 turns) | `test/fixtures/a-normal-chat.jsonl` | Output equals `test/golden/a-normal-chat.md` exactly |
| B | Plugin-injected / goal / skill-catalog `user/message`s mixed with a human turn; injection-only turn; header `cwd` present | `test/fixtures/b-injected.jsonl` | Only the human text and final answer render; injected texts, `cwd`, and the injection-only turn are absent |
| C | Multi-step agent turn: intermediate assistant text, tool call + result, reasoning, packed chunk row | `test/fixtures/c-multistep.jsonl` | Only the final step's text renders; intermediate text, tool name/arguments, reasoning text, and chunk fragments are absent |
| D | Markdown + fenced code blocks in both roles | `test/fixtures/d-markdown.jsonl` | Output equals `test/golden/d-markdown.md` exactly (fences preserved byte-for-byte) |
| E | Chinese / Unicode / emoji content | `test/fixtures/e-unicode.jsonl` | Output equals `test/golden/e-unicode.md` exactly |
| F | Interrupted turn (aborted, no response) + open turn at EOF (incomplete) | `test/fixtures/f-interrupted.jsonl` | Human messages render normally; NO assistant section is synthesized; the neutral marker `> Response incomplete.` follows each; equals `test/golden/f-interrupted.md` |
| G | Image block in human message; surface replacement event; unknown log-only events; unknown surface event | `test/fixtures/g-extras.jsonl` | Text-only output equals `test/golden/g-extras.md`; image counted in stats; unknown **surface** event raises `SessionFormatError` (asserted in `test/sessionlog.test.js`) |
| H | Image-only human turn (image block, no text) | `test/fixtures/h-image-only.jsonl` | A Human section renders with the neutral placeholder `[Image omitted]`; the turn never silently becomes Assistant-only; equals `test/golden/h-image-only.md` |

Structural acceptance (always on):

- Header line with `version !== 0` → `SessionFormatError` (no partial output).
- Non-contiguous `seq` (including across packed chunk rows) → `SessionFormatError`.
- Append-origin surface event outside any turn bracket → `SessionFormatError`.
- Output contains no `usage`, `cwd`, ids, timestamps, or block vocabulary other than text.
- Download filename follows the locked convention `dsh-conversation-<session-id>.md`
  (asserted in `test/extract.test.js`).
- The Markdown has no provenance/session-metadata header (locked default; golden files
  assert the exact document shape).

Production integration acceptance (always on):

- Package declares one DSH bundle patch and one Web client entry; installing the bundle
  composes one `conversation-exporter` row without editing DSH or global configuration.
- Host injects `sessionQuery`, `webServer`, and `webRuntime`; the export route calls
  `sessionQuery.readSession(sessionId)` and feeds its detached events directly to the
  accepted `extract → render` core (no JSONL production hop).
- The plugin-owned route mirrors DSH's Host/Origin trust fence, accepts JSON POST only,
  bounds the request body, returns `no-store` Markdown, and does not leak operational
  failure details to the browser.
- Client registers one additive **Export Chat** contribution in
  `conversation.session.header.utilities`; it does not replace or intercept **Session log**.
- Client posts only the current framework-supplied `sessionId`, creates a Markdown Blob,
  downloads the locked filename, and revokes the object URL.
- Production tests re-run the accepted normal, image-only, and incomplete-turn behavior
  against a `readSession`-shaped snapshot.

## Verification commands

```bash
npm test                    # A–H + production + structural cases: node --test test/
npm run check               # syntax-check every JS file (node --check)
npm pack --dry-run          # installable artifact contains host, client, and bundle patch
node src/cli.js test/fixtures/a-normal-chat.jsonl   # smoke: CLI round-trip
```

Optional isolated live check (privacy-preserving, disposable DSH home):

```bash
DSH_V01_HOME="$(mktemp -d)"
DSH_HOME="$DSH_V01_HOME" dsh plugin --profile web add .
DSH_HOME="$DSH_V01_HOME" dsh web
```

## Exact-SHA acceptance

Acceptance applies to one exact Git commit SHA. Any code, fixture, or golden change after
acceptance invalidates it; the full verification suite must be re-run and the new SHA
recorded. A failing test may never be weakened or deleted to obtain PASS (see
`docs/AI_OPERATING_CONTRACT.md`).
