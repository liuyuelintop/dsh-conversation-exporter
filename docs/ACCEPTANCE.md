# Acceptance — DSH Conversation Exporter

> **STATUS: V0.2 READABLE EXPORT PRODUCT ACCEPTED**
> Accepted V0.2 implementation: `57571d00448f8a2bb387aa9cd3029283328eb36c`
>
> Human product acceptance covered real DSH sessions, readable title/filename behavior,
> transcript boundaries, malformed-fence protection, and Markdown/table/code/CJK export.
> V0.1 product and release accepted at `1c4c63a5823748e07ff87af71a1c16b16e1fa82b`.

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
| I | Fallback title followed by provider title; literal `## Human` / `## Assistant`; Mermaid | `test/fixtures/i-readable-title.jsonl` | Latest valid provider title is the H1; role headings remain ordinary message content; Mermaid fence is unchanged; equals `test/golden/i-readable-title.md` |
| J | Sanitized V0.1 unclosed-fence failure followed by another turn; table/code/CJK | `test/fixtures/j-unterminated-fence.jsonl` | One matching closing fence is inserted before the next role boundary; the later turn, table, inline code, and CJK remain intact; equals `test/golden/j-unterminated-fence.md` |

Structural acceptance (always on):

- Header line with `version !== 0` → `SessionFormatError` (no partial output).
- Non-contiguous `seq` (including across packed chunk rows) → `SessionFormatError`.
- Append-origin surface event outside any turn bracket → `SessionFormatError`.
- Output contains no `usage`, `cwd`, ids, timestamps, or block vocabulary other than text.
- Canonical export data carries `sessionId`, nullable `title`, and conversation `entries`.
- English, Chinese, unsafe-character, empty-title, and no-title filenames follow
  `<sanitized-title>--<short-session-id>.md` with deterministic collision resistance.
- The Markdown H1 is the final usable `session/title`, or `DSH Conversation` when absent;
  no other provenance/session metadata is emitted.
- Balanced backtick/tilde fences, including a longer outer fence around nested backticks,
  remain byte-for-byte unchanged inside the message.

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
  decodes the server's RFC 5987 UTF-8 filename, downloads it, and revokes the object URL.
- Production tests re-run the accepted normal, image-only, and incomplete-turn behavior
  against a `readSession`-shaped snapshot.

## Verification commands

```bash
npm test                    # A–J + production + structural cases: node --test test/
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

V0.2 product acceptance applies to implementation commit
`57571d00448f8a2bb387aa9cd3029283328eb36c`. It passed deterministic acceptance and real
DSH manual testing of the readable heading and filename, distinct transcript boundaries,
unterminated-fence protection, and Markdown/table/code/CJK content. A later commit that
changes only documentation and release metadata may prepare that implementation for
publication, but any later code, fixture, or golden change invalidates acceptance and
requires the full suite and human product checks to be repeated.

V0.1 product and release acceptance applies to implementation commit
`1c4c63a5823748e07ff87af71a1c16b16e1fa82b`. It passed automated acceptance, real DSH
manual smoke testing, and independent release review (`V0_1_RELEASE_ACCEPTED`). Any later
code, fixture, or golden change invalidates that acceptance; the full verification suite
must be re-run and the new SHA recorded. A failing test may never be weakened or deleted
to obtain PASS (see `docs/AI_OPERATING_CONTRACT.md`).
