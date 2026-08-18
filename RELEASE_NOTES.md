# Release notes

## DSH Conversation Exporter 0.3.0

This release adds optional whole-turn selection while keeping the existing one-click
full-conversation export unchanged.

### Highlights

- Adds **Select turns…** beside **Export Chat**, with a chronological scrollable list and
  one checkbox per Human-plus-final-Assistant turn.
- Starts with all turns selected, includes **Select all** and **Clear**, and disables
  selected export when nothing is selected.
- Restores selected turns to original chronological order and reuses the accepted title,
  filename, Markdown, fence-protection, incomplete, and image-only behavior.
- Keeps filtering host-side. The selector receives only bounded canonical previews and
  opaque indexes; raw session events, reasoning, tools, injections, and runtime metadata
  remain unavailable to the browser.
- Uses compact selections for long conversations without enlarging the existing 4 KiB
  request boundary.

### Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-conversation-exporter
```

Restart DSH Web after installation. Use **Export Chat** for the complete current
conversation or **Select turns…** for a non-empty subset of whole turns.

### Compatibility and limitations

V0.3 targets `@deepseek-ai/dsh@0.1.0-rc.6`. It exports the current session as Markdown
only and does not support independent Human/Assistant bubble selection. Attachments,
image data, reasoning, tool activity, injected context, subagent logs, intermediate
responses, telemetry, cloud storage, and the official Session Log remain out of scope.

## DSH Conversation Exporter 0.2.0

This release makes clean Markdown exports easier to identify and read while preserving
the V0.1 extraction, privacy, and security boundaries.

### Highlights

- Uses the final DSH session title as the document's Markdown H1.
- Downloads a readable `<session-title>--<short-session-id>.md` filename, with safe
  Unicode such as CJK retained and a deterministic fallback when no title is available.
- Separates Human and Assistant transcript sections with unambiguous blockquoted role
  labels and thematic boundaries, so message headings remain ordinary message content.
- Closes a malformed unterminated backtick or tilde fence at the end of its message so it
  cannot swallow later turns; already-balanced Markdown remains unchanged.

### Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-conversation-exporter
```

Restart DSH Web after installation, then select **Export Chat** in the session header.

### Compatibility and limitations

V0.2 was validated with `@deepseek-ai/dsh@0.1.0-rc.6`. It still exports only the current
session as Markdown, omits attachments and image data, and performs all export processing
locally without upload, telemetry, analytics, or cloud storage. See `README.md` for the
full limitation list.

## DSH Conversation Exporter 0.1.0

The first public release adds **Export Chat** beside DSH Web's official **Session Log**
action. It downloads the current session as one clean Markdown transcript for reading,
notes, Git, or AI handoff while leaving the lossless Session Log workflow unchanged.

### Highlights

- Exports human-authored messages and each turn's final assistant answer.
- Excludes reasoning, tool calls and results, injected context, runtime metadata, paths,
  token accounting, and streaming noise.
- Preserves Markdown and Unicode content.
- Handles incomplete responses and image-only human turns with neutral markers.
- Runs locally with no upload, telemetry, analytics, or cloud service.

### Install

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-conversation-exporter
```

Restart DSH Web after installation, then select **Export Chat** in the session header.

### Compatibility and limitations

This release was validated with `@deepseek-ai/dsh@0.1.0-rc.6`. DSH remains developer-preview
software, so later DSH releases may require compatibility updates. V0.1 exports only the
current session as Markdown and omits attachments and image data. See `README.md` for the
full limitation list.
