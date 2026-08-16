# Product — DSH Conversation Exporter

> **STATUS: GATE A BASELINE ACCEPTED; V0.1 CANDIDATE AWAITING ACCEPTANCE**

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

## Non-goals (V0.1)

- Replacing or reimplementing the official raw Session ZIP export.
- Forensic/debug/replay fidelity.
- Exporting reasoning chains, tool activity, subagent logs, or attachments.
- Merging multiple sessions or exporting a whole workspace.
- PDF/HTML/JSON output formats.
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

## Locked product defaults (Gate A)

1. **License:** MIT.
2. **Filename:** `dsh-conversation-<session-id>.md` (session id sanitized to `[A-Za-z0-9_-]`).
3. **No provenance header:** clean Markdown starts directly with the first `## Human`
   section — no session metadata, ids, dates, or paths.
4. **Unanswered turns:** the human message renders normally; no Assistant section is
   synthesized. The neutral marker `> Response incomplete.` follows the human message.
5. **Image-only human messages:** render as a Human section with the neutral placeholder
   `[Image omitted]` — a human turn never silently becomes Assistant-only.

## V0.1 implementation decision

V0.1 uses a same-origin host-served Markdown response followed by a browser Blob download.
This follows DSH's host-streamed Session Log precedent while keeping the clean export as a
separate additive action and avoiding JSON/RPC encoding overhead for large conversations.
