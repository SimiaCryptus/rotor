# Agents

Agents are optional AI helpers that read part of your notebook and **propose** changes.
They are inert until you connect a Cognotik account, and they never change anything without your review.

> **An agent is just another writer, and it writes through the same door you do.**
> Its output is turned into the same kind of change a gesture produces, checked by a validator, shown for review, and applied as a single undoable step.

## Where requests go

All agent traffic goes to the **Cognotik hosted API proxy** (`https://hosted.cognotik.com` by default), or to a self-hosted Cognotik on `localhost`.
The protocol is not duplicated in Rotor: `src/js/ai/` imports `cognotik-example/cognotik-client.mjs`, and the build bundles it.

| Endpoint | Purpose |
|---|---|
| `GET /api-proxy/models/{providers}` | Model list (fills the model dropdown, grouped by upstream provider) |
| `POST /api-proxy/chat/{providers}?session={id}` | Submit a chat request, returns `{token}` |
| `GET /api-proxy/chat/{providers}/result/{token}` | Poll: 200 = response, 202 = pending |

### Connecting

Open **Agents ▸ Cognotik account & model…** (or `/ai signin`).

- **Sign in**: opens a Cognotik window. Rotor polls the model list every 2.5 s (up to 3 minutes) and detects the session as soon as the cookie works.
  - For cross-origin cookie sign-in, the Cognotik server must send CORS headers with `Access-Control-Allow-Credentials: true` for Rotor's origin, and its session cookie must be `SameSite=None; Secure`.
- **API key** (optional): sent as `X-API-Key`.
  - Use it when your browser blocks third-party cookies, or when running from `file://`.
  - By default it is held for this session only. Tick *Remember in this browser* to persist it.
- **Server** and **upstream providers** live under *Advanced*. Defaults: `Gemini, Anthropic, ElevenLabs, Groq, Mistral, xAI, DeepSeek`.
- The server must be a `*.cognotik.com` address, or `localhost` / `127.0.0.1`. This matches the build's CSP `connect-src`.
- **Model**: choose from the dropdown (text-capable models only), or *Other model id…*. `/ai model <id>` also sets it.
  - If none is set, Rotor picks a Claude Sonnet model (or the first non-deprecated text model) after connecting.

Connection states shown in the panel: `unknown` → `checking` → `ok`, or `auth` (sign-in needed), `signing` (waiting for the pop-up) or `error`.

## The agents

| Agent | What it does | Scopes | May propose |
|---|---|---|---|
| **Classifier** | Assigns values on one dimension (you pick it). Prefers existing values; new values are flagged ⚑ for attention. | unassigned (`—` on the dimension, in the current view), cell, view, note | coordinate assignments on the target dimension only |
| **Expander** | Elaborates one note into 1–3 new notes. | note | new notes sharing the source note's coordinates |
| **Reducer** | Tightens one note (shown as a word diff), or condenses a cell into one note. | note, cell | content rewrites; one new condensed note |
| **Synthesizer** | Merges related notes into 1–3 syntheses. Sources are untouched. | cell, view | new notes at the shared coordinates of their cited sources |
| **Critic** | Finds contradictions, tensions and duplicated ideas. Read-only by construction. | view, cell | findings; each becomes a note only if you accept it |
| **Mapper** | Proposes one brand-new categorical dimension (a new "way to rotate by meaning") and assigns every note. | view, cell | one new dimension with values and assignments |
| **Planner** | Needs a goal. Builds 3–8 ordered steps as a new **ordinal** dimension with one note per step, plus a suggested view with the steps on columns. | view, cell, note | new dimension, new notes on it, a view suggestion |

### Scopes

The scope decides which notes the agent can see. It is an upper bound on what is sent.

- **note**: the selected note (not encrypted).
- **cell**: the last cell you focused or clicked, if it is still in the current projection.
- **unassigned**: notes in the current view with no value on the chosen dimension.
- **view**: every note currently placed in the grid, so **active filters and search apply**.

Encrypted notes are **excluded from every scope**, even if unlocked. See [crypto.md](crypto.md).
Scopes over 200 notes need explicit confirmation.

## Running an agent

1. Open the panel: `Ctrl/Cmd+J`, the **Agents** menu, the side panel's Expand / Reduce / Classify… buttons, or `/ai …`.
2. Choose the agent, scope, model (and dimension or goal if required). The preview shows the provider host, model, note count and an estimated input token count (`≈ characters / 4`).
3. **Run.** The first run asks for consent, naming the server and the number of notes. Consent is stored per browser.
4. A single request is made (`temperature 0.2`, `max_tokens 4096`). Progress and the model's status stream into the panel. `Esc` aborts, and an aborted run produces no proposal. The overall limit is 5 minutes.
5. The reply is parsed as JSON and validated. If validation fails, Rotor **retries once**, sending the error back to the model. If it fails again the run ends with an error and nothing is applied.
6. A dry run applies the proposal to a copy of the document and checks the [invariants](model.md#invariants). Only then does the review panel open.
7. **Review.** Changes are grouped as new dimensions, new values ⚑, new notes, coordinate changes, content rewrites, findings and suggested view.
   - Every change has a checkbox.
   - New and rewritten text is editable in place; rewrites also show a word-level diff.
   - `Ctrl/Cmd+Enter` accepts the selection. `Esc` or *Discard* leaves no trace.
8. **Accept.** Chosen changes are applied in one `commit`, so one `Ctrl/Cmd+Z` undoes the lot. A suggested view is applied as a rotation (navigation history, not undo).

### What is sent

Only this goes to the server:

- the **labels** of non-date dimensions and their values;
- for each note in scope: its text and its coordinates **as labels**;
- the agent's instructions, your goal if any, and (on retry) the rejected reply and error.

Note IDs are replaced with short per-run aliases (`i1`, `i2`, …) and mapped back during validation.
Titles, timestamps, document and dimension IDs, other notes, and encrypted notes are never sent.
The system prompt tells the model that note contents are untrusted data and must not be treated as instructions.

## Proposal validation

`model/proposals.js` (pure, no DOM or network) turns raw model JSON into a list of reviewable changes:

- **Structured output only**: the reply must be a JSON object. Surrounding Markdown fences are tolerated.
- **Per-agent allowlists**:

  | Agent | Allowed keys |
  |---|---|
  | classifier | `assign` |
  | expander | `newItems` |
  | reducer | `rewrites`, `newItems` |
  | synthesizer | `newItems` |
  | critic | `findings` |
  | mapper | `newDimension` |
  | planner | `newDimension`, `newItems`, `view` |

  Any non-empty use of another change key is an error.
- **Deletion is not expressible**: any key containing `delete` or `remove` is rejected outright.
- **Locality and scope**: every referenced note alias must exist and be inside the run's scope. The classifier may only touch its target dimension.
- **Limits**: at most 50 new notes (1 for the reducer), 30 findings, 1–30 values in a new dimension, and no duplicate or already-existing dimension name.
- **Derived coordinates**: agents don't choose arbitrary coordinates for new notes.
  - Expander notes inherit the source note's shared coordinates.
  - Synthesizer notes inherit the coordinates shared by their cited sources.
  - Other notes get the scope's shared coordinates, plus the step value for the planner.

When accepted (`applyChanges`):

- new dimensions and values are created first;
- references to values you unticked are dropped;
- new and rewritten notes get provenance `{agent, model: "cognotik/<model>", at, sources}`;
- findings become notes (`**Critic finding:** …` plus links to the cited notes' first lines) coordinated at the shared address of the notes they cite.

## Prompt-injection posture

Notes may contain text such as "ignore your instructions and…". The architecture limits what such text can do:

- agents have no write access, only proposals;
- the validator rejects out-of-scope references and any deletion;
- every proposal goes through the dry-run invariant check and human review.

The worst a hostile note can do is produce a bad suggestion that you decline.

## Settings and log storage

All in `localStorage`, under the `rotorai:` prefix, apart from notebooks and never exported.

| Key | Contents |
|---|---|
| `rotorai:cognotik` | `{baseUrl, model, providers}` |
| `rotorai:cognotik:key` | API key, only if you ticked *Remember* |
| `rotorai:consent:cognotik` | Timestamp of first consent |
| `rotorai:log` | Run log, last 200 entries |

The **run log** (`/ai log`) records metadata only: time, agent, provider, model, note count, tokens in/out, cost and outcome (`ok · N changes`, `aborted`, `timeout`, `error: …`). It never records prompt content.
Older multi-provider settings are migrated once and then removed.

## Palette commands

`/ai synthesize`, `/ai classify <dim>`, `/ai plan "goal"`, `/ai critique`, `/ai expand`, `/ai reduce`, `/ai map`, `/ai settings`, `/ai signin`, `/ai model <id>`, `/ai log`.