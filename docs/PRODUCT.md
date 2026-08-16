# Product — DSH Conversation Exporter

> **STATUS: DRAFT — NOT HUMAN ACCEPTED**

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

The exporter consumes the same session-log data the official export ships
(`session.jsonl`), so the two stay compatible without sharing code or product surface.

## Open questions for the human owner

1. Default file name convention (e.g. `conversation-<session-id>.md`)?
2. Include a one-line provenance comment (session id / date) at the top of the file?
   (Stage 0 default: no — output is Human/Assistant sections only.)
3. License choice for the open-source repository.
4. Whether unanswered (aborted/incomplete) turns should render a marker line or be omitted.
   (Stage 0 default: marker line.)
