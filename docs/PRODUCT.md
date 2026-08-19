# Product — DSH Conversation Exporter

> **STATUS: V0.3 PRODUCT ACCEPTED — RELEASE PREPARATION**
> V0.3 baseline: released V0.2 `6487ce6af8d26687a43b7ba98a92af9fc5325122`.
>
> Accepted V0.3 implementation: `904a068bec1da3ebf0abec77726617bce5276e45`
>
> Accepted V0.2 implementation: `57571d00448f8a2bb387aa9cd3029283328eb36c`
>
> V0.1 product and release accepted at `1c4c63a5823748e07ff87af71a1c16b16e1fa82b`.

## Problem

DeepSeek Harness Web records a conversation as a rich, lossless session log. Its official
raw Session ZIP export is forensic: it contains every event — streaming chunks, reasoning,
tool calls and results, system/plugin injections, runtime metadata, subagent logs,
attachments — which makes it ideal for replay and debugging and hostile to human reading
and AI handoff. There is no clean export today.

## Target user

A person who used DSH Web to get work done and now wants to keep, share, or re-attach the
*conversation* — not the machinery:

- reading the conversation later like a document;
- storing it in Git or a notes system;
- attaching it to ChatGPT, Codex, or Claude as context.

## V0.1 outcome

One button in DSH Web, next to the existing "Session log" export, that downloads the
**current** conversation as a clean Markdown file containing exactly:

- every human-authored message (in order);
- the final visible assistant response for each human turn;

and nothing else by default (no reasoning, tool calls/results, injections, runtime context,
paths, token accounting, or streaming noise).

## V0.2 readable-export outcome

The same local-only export now uses the latest valid log-backed DSH session title as the
document H1 and readable filename stem. Blockquoted role labels and thematic separators
remain distinct from headings inside messages. A message that ends with an open fenced
code block receives only the matching closing fence needed to protect later transcript
sections.

## V0.3 selective-turn outcome

The existing one-click **Export Chat** action continues to export the whole current
conversation without opening another UI. An adjacent **Select turns…** action opens a
small chronological selector with one checkbox per conversation turn, all selected by
default. The user can select all, clear the selection, and export any non-empty subset.

A selectable turn is the existing canonical unit: all human-authored messages in one DSH
turn plus that turn's final visible Assistant response, or its existing incomplete marker.
Human and Assistant bubbles cannot be selected independently.

## Non-goals (V0.3)

- Replacing or reimplementing the official raw Session ZIP export.
- Forensic/debug/replay fidelity.
- Exporting reasoning chains, tool activity, subagent logs, or attachments.
- Selecting Human-only or Assistant-only bubbles.
- Merging multiple sessions or exporting a whole workspace.
- PDF/HTML/JSON output formats.
- AI summarization.
- Any cloud service, upload, telemetry, or analytics.
- A browser-independent desktop app.

## Positioning

| | Official DSH Session Log | DSH Conversation Exporter |
|---|---|---|
| Purpose | lossless / raw / debug / replay | clean / human-readable / AI-handoff |
| Contents | every event, chunk, tool result, attachment | human messages + final answers only |
| Format | ZIP of JSONL artifacts + media | one Markdown file |
| Audience | debugging, recovery, forensics | humans, other AI assistants, Git/notes |

The exporter consumes the same session-log event data the official export ships
(`session.jsonl`): in production via the runtime `sessionQuery.readSession` service, and in
the test/debug CLI via the JSONL artifact. The two stay compatible without sharing code or
product surface.

## Product defaults

1. **License:** MIT.
2. **Filename:** `<sanitized-session-title>--<short-session-id>.md`; safe Unicode such as
   CJK is retained, and a missing title uses `dsh-conversation--<short-session-id>.md`.
3. **Document heading:** clean Markdown starts with the latest valid `session/title` as H1,
   or `DSH Conversation` when no title exists. No ids, dates, paths, or provenance metadata
   are added to the document.
4. **Unanswered turns:** the human message renders normally; no Assistant section is
   synthesized. The neutral marker `> Response incomplete.` follows the human message.
5. **Image-only human messages:** render as a Human section with the neutral placeholder
   `[Image omitted]` — a human turn never silently becomes Assistant-only.
6. **Selective export:** all canonical turns start selected; export is disabled for zero
   selections; the host restores chronological order regardless of selection request
   ordering.

## V0.1 implementation decision

V0.1 uses a same-origin host-served Markdown response followed by a browser Blob download.
This follows DSH's host-streamed Session Log precedent while keeping the clean export as a
separate additive action and avoiding JSON/RPC encoding overhead for large conversations.

V0.2 does not call an LLM. It folds already-recorded `session/title` events and otherwise
keeps the V0.1 privacy and extraction boundaries unchanged.

V0.3 adds a same-origin host response containing only bounded previews of the already
privacy-filtered canonical turns. The browser receives opaque chronological indexes and
short Human/Assistant previews, never raw events, DSH turn ids, reasoning, tools,
injections, runtime metadata, or full session logs. Selected indexes are validated and
filtered on the host before the unchanged Markdown renderer runs.
