# Release notes

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
