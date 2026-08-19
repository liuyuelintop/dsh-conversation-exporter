# Architecture — DSH Conversation Exporter

> **STATUS: V0.3 PRODUCT ACCEPTED — RELEASE PREPARATION**
> V0.3 baseline: released V0.2 `6487ce6af8d26687a43b7ba98a92af9fc5325122`.
>
> Accepted V0.3 implementation: `904a068bec1da3ebf0abec77726617bce5276e45`
>
> Accepted V0.2 implementation: `57571d00448f8a2bb387aa9cd3029283328eb36c`
>
> V0.1 product and release accepted at `1c4c63a5823748e07ff87af71a1c16b16e1fa82b`.

This document contains findings **verified** against installed/current DSH runtime source,
the Stage 0 spike, and the isolated V0.1 integration check. Claims without evidence live
in the "Open questions" section, not here.

## Evidence base

Everything below was verified at spike time against:

- the installed harness checkout (npm `@deepseek-ai/dsh@0.1.0-rc.6`), path
  `<npx-cache>/node_modules/@deepseek-ai/...` (exact paths cited per finding);
- the **live runtime** via Creator Mode inspection providers
  (`cordis_inspect_query`: Host/Client `Service.listService`, `Slots.listSubTree`);
- a **real session artifact** of the spike's own session, read locally from
  `$DSH_SESSION_JSONL` (decompressed with the `zstd` CLI; never committed, never uploaded).

Package files are cited as `<pkg>/<file>` relative to that checkout root.

## Verified DSH findings

### F1 — The session is an append-only event log with a closed core vocabulary

`dsh-session/lib/types/types.d.ts` defines `SessionEvent = { type, seq, time, data }`
plus conditional `surfaceOp` / `sourceEventSeqs` on surface event types. Core event types
(`SessionEventMap`): `turn/start`, `turn/end` (with `reason`), `step/start`, `step/end`,
`user/message`, `assistant/chunk`, `assistant/message` (`{turn, step, message, usage?}`),
`tool/call`, `tool/result`, and log-only records (`request/header`, `request/context`,
`todo/write`, `session/end-seed`, …). Plugins merge-extend the map — observed in a real log:
`permission/preset`, `sandbox/mode`, `approval/policy`, `agent-preset/selected`,
`command/run`, `command/done`, `agent/inbox/spliced`, `session/title`, `goal/change`.

### F2 — `source.kind === 'user'` is the human-message discriminator

`dsh-llm/lib/types/message.d.ts`: `Message.source: MessageSource`; base kinds are
`user` (`{kind:'user'}`), `plugin` (`{kind:'plugin', plugin, form?}`),
`model`, `tool`; `dsh-goal` merge-extends a `goal` kind
(`{kind:'goal', goalId, revision, round}`). Verified on a real log: the human message
carried `kind:'user'`, while three sibling `user/message` events carried
`kind:'plugin'` (approval-policy notice), `kind:'plugin'` + `form:'snapshot'`
(system prompt), and a merge-extended `kind:'skill-catalog'`. Unknown kinds are possible
by design — the exporter treats anything that is not exactly `'user'` as non-human.

### F3 — Turn and step brackets are explicit log events

`turn/start`/`turn/end` and `step/start`/`step/end` bracket turns and steps
(`dsh-session/lib/types/types.d.ts`). One `assistant/message` is appended **per step**.
Verified on a real log: 19 `step/start` events and 19 `assistant/message` events in one
turn; the final visible response is therefore the **last** assistant message of the turn
bracket, not merely the last assistant message. The same real session's turn was still
open at read time (no `turn/end`), and `dsh-session/lib/types/repair.d.ts` shows persistence
repair synthesizes `step/end` + interrupted `turn/end` closers for crash tails.

### F4 — The surface: only three event types; use append-origin events for transcripts

`dsh-session/lib/types/types.d.ts`: `SurfaceEventType = 'user/message' |
'assistant/message' | 'tool/result'`; surface events carry `surfaceOp` (`'append'` or a
`replace` range). `dsh-session/lib/types/surface.d.ts` states the replacement semantics and
— authoritatively for this product — that append-origin events are "the durable source
material" for a human transcript, while replaced ranges stay model-only. The exporter
therefore keeps `surfaceOp === 'append'` events and skips replacement events.

### F5 — Content blocks: text is the only clean-export vocabulary

`dsh-llm/lib/types/types.d.ts`: `ContentBlockMap` = `text`, `reasoning`, `image`
(`{attachment: ImageAttachmentRef}`), `tool-call`, `tool-result` (merge-extensible).
Verified on a real log: 18 of 19 assistant messages contained `reasoning` blocks, and the
19th carried only `tool-call` blocks — the exporter keeps `text` blocks and skips the rest
(verified exclusion by construction; `reasoning` text must never leak).

### F6 — Official raw export path (the pattern to reuse)

`dsh-session-log-export/lib/index.js` registers a host `/export` human command;
`dsh-session-log-export/lib/client.js` observes the `command/executed` event and downloads
`GET/HEAD /api/session.export?sessionId=<id>&includeDescendants=true` via an
anchor-click (`<a download>`), filename `dsh-session-<sanitized>.zip`. The route handler is
`dsh-host-apiproxy/lib/index.js` (~line 4996); the response is
`Content-Disposition: attachment; filename=...` (`dsh-host-apiproxy/lib/types/api-proxy.js`
~line 3400). ZIP contents (`dsh-host-apiproxy/lib/types/session-export.js`): root artifact
`session.jsonl` verbatim, subagents under `subagents/<id>/`, media under `media/<id>.<ext>`.
The exporter's V0.1 button belongs to the **same client slot** the official button uses:
`conversation.session.header.utilities` (verified live: `Slots.listSubTree`, list slot,
session scope, `{id, order?, label?}` registration).

### F7 — Durable artifact format (the exporter's input format)

`dsh-session-persistence-jsonl/lib/index.js`: one JSONL artifact per session
(`session.jsonl` or `session.jsonl.zstd`); line 1 is the header
`{type:"session", version:0, id, createdAt, cwd?, parentSession?, seedLength?, origin?,
delegationDepth?, agentPreset?}` (verified byte-for-byte on a real artifact); following
lines are session events or **packed chunk rows** (`text-chunks` / `reasoning-chunks` /
`tool-call-chunks` with `seq0`/`time0`/`dt`/`texts`|`args`,
`dsh-session/lib/types/chunk-rows.d.ts`) that expand back to `assistant/chunk` deltas.
Foreign `version` must be refused (the backend does; verified in the same file). Real
artifact path: `$DSH_HOME/sessions/<project-key>/<id>/session.jsonl.zstd`; the current
session's path is exposed as `DSH_SESSION_JSONL`, its id as `DSH_SESSION_ID` (verified live).

### F8 — Host query services for the plugin path

Host service catalog (`Service.listService`, verified live): `sessionQuery.readSession(id)`
returns a cloned, repaired, replay-validated full log (`SessionLogSnapshot {session,
events}`); `readSurface(id)` returns the folded current surface; `listEvents(id)`
classifies each event `current | shadowed | log-only` (`dsh-session-query/README.md`,
`dsh-session-query/lib/types/types.d.ts`). `sessionPersistence.readRaw(id)` returns the
verbatim artifact. `sessions` is the live in-memory store; `apiProxy.downloads` owns the
official download API; `webServer.register(route)` exists for host-served download routes.
Catalog entries describe the contract; a plugin must still `ctx.get()` them at runtime
(mounting is not guaranteed by the catalog).

### F9 — Client extension points (verified live)

`Slots.listSubTree`: `conversation.session.header.utilities` (additive, replaceRisk none —
where the official "Session log" button lives), `conversation.session.header.actions`,
`settings.section`, `shell.overlay`, and the dynamic-plugin Run-card region
`tool.view.cordis` (key `'self'` only). Session-scoped slots provide the session id via
their props (the official export button reads `sessionId` from props — verified in
`dsh-session-log-export/lib/client.js`).

### F10 — Browser local-download mechanisms (both proven to exist)

1. Official pattern (verified): host streams the file over a same-origin route; the client
   does `anchor.href = url; anchor.download = filename; anchor.click()`.
2. Client-only pattern (standard, proven in `demo/download-demo.html`): build the content
   client-side, `new Blob([text], {type:'text/markdown'})`,
   `URL.createObjectURL(blob)`, anchor-click, then revoke.

Either satisfies "local download"; V0.1 can pick by plugin shape.

### F11 — Observed discrepancy (runtime vs. docs)

The session envelope documents that an unrecognized event **without** `ignorable:true`
must make a reader refuse to reconstruct (`dsh-session/lib/types/types.d.ts`). A real log
contained 15 plugin events with no `ignorable` marker and `ignorable` count 0. A strict
reconstructor could not read a real session; the exporter is not a reconstructor and uses
the documented narrower rule: unknown event types are skippable **unless** they carry
`surfaceOp` (i.e. claim surface membership), which fails loud. Non-surface unknown types
cannot affect the transcript. Recorded here as a deliberate, documented interpretation.

### F12 — Runtime-verified: dynamic host plugin path (this session)

A host-only dynamic Package activated and ran **without approval** under this
session's `never` approval policy. From plugin code it successfully:

1. called `sessionQuery.readSession(<current session id>)` and received the live,
   expanded log (15.8 MB JSON, contiguous seqs, 61 `assistant/message` events at
   read time) — runtime mount of the catalog contract (F8) confirmed;
2. serialized header + events to JSONL and wrote it through the `fs` service —
   which then fed the repo CLI end-to-end: clean 9.5 KB Markdown, 1 human turn,
   all injections/reasoning/tool blocks excluded;
3. registered a model-visible tool via `harness.defineTool` + `registerTool`
   (verified in the live `Tool.listTools` catalog).

Tool-definition gotchas (verified by runtime errors): `ToolDefinition.output`
is mandatory and uses the value-schema DSL — top-level `required` is rejected
and `additionalProperties` must be explicit (`dsh-tools/lib/types/index.d.ts`,
`schema.d.ts`).

### F13 — Runtime-verified: `fs` relative paths resolve against the harness cwd

A plugin-side `fs.resolve('tmp/…')` (relative) landed at `$HOME/tmp/…` — the
harness **process** cwd — not the session workspace. A V0.1 plugin must use an
absolute path (e.g. derived from the session header or workspace registry),
never a bare relative path.

### F14 — What this session could NOT verify live

Activating a **Client** dynamic plugin (the real in-page download button) requires plugin
approval; this session's approval policy is `never`, so a Client Package cannot be
activated here. The client-side mechanism is proven in a standalone page (F10.2), and the
slot/event wiring is proven from installed source (F6/F9), but the end-to-end in-DSH-page
button remains unproven in this session. This is the spike's documented blocker, not a
faked success.

### F15 — V0.1 revalidation against current DSH APIs

Before V0.1 implementation, the production seams were rechecked against installed
`@deepseek-ai/dsh@0.1.0-rc.6` and official DeepSeek Harness `master` at
`47f943859bef60e4160492346772ded9b24f765a` (2026-08-17). Both expose the same contracts
used here: `sessionQuery.readSession(id)`, `webServer.register({kind:'exact', ...})`,
`webRuntime.trustedHosts`, `dsh.client` discovery through the `./client` export, and the
additive `conversation.session.header.utilities` slot with a framework-supplied
`sessionId`. The plugin mirrors DSH Web's Host/Origin trust fence on its exact `/api`
route because an exact route is owned by this plugin rather than the ApiProxy prefix.

### F16 — V0.1 isolated live integration

The repository installed successfully as a bundle into a disposable DSH home and composed
one `conversation-exporter` row after the shipped Web bundle. In the live Web page, a real
session rendered **Export Chat** immediately beside the unchanged **Session log** action.
The plugin route read that current session through `sessionQuery` and returned exactly the
human message plus `> Response incomplete.` after the deliberately credential-blocked turn.
The browser automation backend did not surface a download event for the Blob/anchor click;
the shipped client artifact's fetch, Blob, filename, click, revoke, and failure paths are
therefore also covered directly by deterministic integration tests.

### F17 — V0.2 title semantics (verified against published DSH source)

Published `@deepseek-ai/dsh-session-title@0.1.0-rc.6` defines `session/title` as a
log-only event with `{title, messageSeqs, source}` data. Its `foldSessionTitle(events)`
uses the last logged `session/title`; the title never enters the model surface or derived
message history. The service first appends a synchronous `source.kind:'fallback'` title
from the first eligible human text. The separately published
`@deepseek-ai/dsh-session-title-first-prompt-llm@0.1.0-rc.6` registers a provider that may
append a later `source.kind:'provider'` title. `sessionQuery.readSession(id)` returns the
complete detached event log, so V0.2 mirrors the official last-wins fold over that existing
snapshot and never invokes an LLM itself.

## Stage 0 spike architecture — TEST/DEBUG path only

The JSONL artifact and the CLI below are the **test/debug harness**. They
exercise the exact `extract → render` core the production path uses, with a
file standing in for the runtime read. The production architecture is the
read path in the next section, not this file pipeline.

```
session.jsonl[.zstd]            (official durable artifact, F7 — debug input)
      │  parseSessionLog        (header gate; chunk-row skip; seq-contiguity check)
      ▼
raw events (in-order)
      │  extractConversation    (latest valid title F17; turn brackets F3;
      ▼                          human append-origin text only F2/F4/F5)
{title | null, entries: human messages + final assistant text | null}
      │  renderConversation     (H1 + protected role sections)
      ▼
Markdown (# title, > **Human** / > **Assistant**, message text)
      │  CLI write-to-file      (or browser Blob → anchor download, F10)
      ▼
<sanitized-title>--<short-session-id>.md
```

Deterministic rules (documented here and enforced by tests):

1. A **human turn** is a turn bracket containing ≥1 append-origin `user/message` with
   `source.kind === 'user'`; other turns (injection-only, goal rounds) are excluded whole.
2. The **final assistant response** of a turn is the last append-origin `assistant/message`
   inside its bracket whose content has non-empty visible text; intermediate steps never
   render. A turn without one renders **no** assistant section — the human message stands,
   followed by the neutral marker `> Response incomplete.` (never a synthesized response).
3. Only `text` blocks render, verbatim (paragraphs, fences, CJK preserved). `reasoning`,
   `tool-call`, `tool-result`, `image` blocks and all non-surface events are skipped and
   counted in stats. A human message with no visible text (e.g. image-only) renders the
   neutral placeholder `[Image omitted]` — a human turn never silently becomes
   Assistant-only.
4. `cwd`, paths, `usage`, ids, and header metadata never reach the output by construction;
   the Markdown title is the only new session-derived document metadata.
5. The latest usable `session/title` wins. No title produces the neutral H1
   `DSH Conversation` and filename stem `dsh-conversation`.
6. Each role label is a blockquoted bold marker separated by a thematic rule. Before a
   later section is appended, a still-open backtick or tilde fence in the current message
   is closed with the same fence character and length; balanced Markdown is unchanged.

## V0.1 production architecture

```text
conversation.session.header.utilities (current sessionId)
      │  POST /api/conversation.export (same-origin JSON request)
      ▼
Host trust boundary (DSH Host/Origin rules + bounded request body)
      │  sessionQuery.readSession(sessionId)
      ▼
detached validated SessionLogSnapshot.events
      │  extract title + conversation → render protected Markdown
      ▼
text/markdown response (no-store, nosniff)
      │  RFC 5987 UTF-8 filename → Blob → hidden anchor click → revoke
      ▼
<sanitized-title>--<short-session-id>.md
```

The host performs all conversation processing locally. The browser receives only the
finished Markdown over the same DSH origin. The JSONL artifact/CLI remain test/debug
infrastructure and are not used by the production route. The official `/api/session.export`
and its **Session log** action are not replaced, patched, or intercepted.

## V0.3 selective-turn extension

The V0.1/V0.2 full export request remains unchanged: `{sessionId}` sent to
`/api/conversation.export` still takes the fast `readSession → extract → render` path and
returns the full conversation Markdown.

```text
Select turns… (current sessionId)
      │  POST /api/conversation.turns
      ▼
same Host/Origin + JSON + 4 KiB request boundary
      │  sessionQuery.readSession(sessionId)
      ▼
extractConversation(events) — existing privacy filter
      │  discard raw turn ids; collapse whitespace; cap previews at 180 characters
      ▼
{turns: [{index, human, assistant|null}]} → scrollable one-checkbox-per-turn dialog
      │  non-empty include/exclude indexes, or compact bitset for large selections
      ▼
POST /api/conversation.export {sessionId, selection}
      │  readSession → extract canonical entries → validate/filter in source order
      ▼
existing renderConversation + title + filename + Blob download
```

The selector response is deliberately not a general conversation API. It contains only
the minimum UI model derived from canonical export entries: a zero-based opaque index and
bounded Human/final-Assistant previews. It omits the session id (already held by the
requesting component), title, unbounded message bodies, DSH turn ids, raw events, reasoning,
tools, injected context, usage, paths, and runtime metadata.

Selection is an extra host-side stage between canonical extraction and the existing
renderer. Include indexes are treated as a set and the canonical entry array is always
walked in source order, so the client cannot reorder or duplicate output. The request's
turn count binds it to the selector snapshot; if a new turn appears while the dialog is
open, the host rejects the stale selection and the user reloads it. Exclude form makes the
default all-selected request constant-size; a validated base64 bitset keeps large
arbitrary selections inside the unchanged 4 KiB request limit. Both client and host block
zero selected turns.

Both plugin-owned routes use the same local same-origin trust fence, bounded JSON body,
`no-store`, and `nosniff` response policy. The extraction, privacy, title, filename,
Markdown renderer, CLI/debug path, and official Session Log endpoint remain unchanged.

## Open questions

1. Markdown flavor pinning (message text remains pass-through except for end-of-message
   fence closure).
