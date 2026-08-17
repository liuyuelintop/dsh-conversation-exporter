# Release notes

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
