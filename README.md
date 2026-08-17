# DSH Conversation Exporter

DSH Conversation Exporter adds an **Export Chat** action to DeepSeek Harness (DSH)
Web. It downloads the current conversation as a clean Markdown file containing the
human-authored messages and final assistant answers, ready for reading, notes, Git, or
handoff to another AI assistant.

## Export Chat vs. Session Log

**Export Chat** is an additive action; it does not replace or modify DSH's official
**Session Log** export.

| | Export Chat | Official Session Log |
|---|---|---|
| Purpose | Reading and AI handoff | Debugging, recovery, and replay |
| Contents | Human messages and final assistant answers | Raw events, chunks, tool activity, metadata, and attachments |
| Format | One Markdown file | ZIP of JSONL artifacts and media |

Use **Export Chat** when you want the conversation. Use **Session Log** when you need a
lossless record of how DSH produced it.

## Install and activate

For DSH installations run through `npx @deepseek-ai/dsh`, add the plugin to the `web`
profile:

```bash
npx @deepseek-ai/dsh plugin --profile web add dsh-conversation-exporter
```

Adding the package to the `web` profile activates its host and browser components. If DSH
Web is already running, stop it and restart it so the profile is recomposed:

```bash
npx @deepseek-ai/dsh web
```

## Use

1. Open a conversation in DSH Web.
2. Select **Export Chat** in the current session header, beside **Session Log**.
3. Your browser downloads `dsh-conversation-<session-id>.md`.

The export preserves message Markdown, omits DSH internals such as reasoning, tool calls
and results, runtime metadata, paths, and token accounting, and marks an unanswered turn
with `> Response incomplete.`. Image-only human messages are retained as
`[Image omitted]`.

## Privacy

Exporting is local-only. The plugin reads the selected DSH session through the local DSH
runtime and returns the Markdown to the same local Web application. It has no upload,
cloud storage, telemetry, or analytics path. The repository contains only hand-written,
sanitized test conversations.

## V0.1 limitations

- Exports the current session only, in Markdown only.
- Keeps human-authored text and the final assistant answer; attachments, images, reasoning,
  tool activity, injected context, subagent logs, and intermediate responses are omitted.
- Preserves Markdown verbatim. Unbalanced fences can affect the preview of later sections,
  and literal `## Human` or `## Assistant` text can resemble transcript boundaries.
- An image-only human message is represented by `[Image omitted]`; image data is not
  embedded.

## Compatibility

DSH is developer-preview software and its plugin APIs may change. V0.1 was validated with
`@deepseek-ai/dsh@0.1.0-rc.6`; a later DSH version may require an exporter update.

## Development

Requires Node.js 20 or newer.

```bash
npm run verify
```

This runs the complete test suite, JavaScript syntax checks, and an npm package dry-run.

Licensed under the [MIT License](LICENSE).
