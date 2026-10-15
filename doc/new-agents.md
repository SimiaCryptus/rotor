# New agents (design proposal)

> **Status: design only.** Nothing on this page is implemented.
> It extends [agents.md](agents.md), which describes the seven existing agents, and reuses its pipeline unchanged:
> *scope → one request → JSON → validator → dry run → review → one `commit`.*

The existing agents work **on notes**: classify them, expand them, merge them. The agents below work **on the shape of the notebook**: its dimensions, its values and its coverage. They create structure and fill it in.

## Where this came from

Three use cases motivated this page:

1. **Dimension / template synthesis**: "make me an issue management schema".
2. **Fill in data**: "add *Mercury* to the *Planets* dimension, with all applicable notes generated, so the Mercury slice looks like the others".
3. **Populate data**: more freeform than adding one value. It fills an empty schema, from nothing, a brief, or pasted material.

Each becomes an agent: **Architect**, **Extender** and **Populator**. Four more ideas follow: **Tidier**, **Viewsmith**, **Describer** and **Analyst**. The ideas are ordered by how much new machinery they need.

## Principles carried over (non-negotiable)

These stay exactly as in [agents.md](agents.md) and [security.md](security.md):

- **An agent is just another writer, and it writes through the same door you do.** Output becomes reviewable changes, and accepting is one `commit`, so one `Ctrl/Cmd+Z`.
- **Deletion is not expressible.** Any key containing `delete` or `remove` is rejected. New keys on this page are named to avoid those words (`renameValues`, not `removeValues`).
- **Per-agent allowlists**. A new agent gets its own row in `ALLOW`.
- **Locality and scope**. Every referenced note alias must be in the run's scope, and every referenced dimension and value must exist or be declared as new in the same proposal.
- **Encrypted notes are never sent**, in any scope.
- **Note text is untrusted data**, and so is anything the user pastes into a new input field.
- **Aliased IDs**. Notes become `i1`, `i2`, … and dimensions and values are sent as labels. The validator maps them back.
- **Metadata-only run log**.

## Summary

| Agent | One-line job | Reads | May propose | Needs new machinery |
|---|---|---|---|---|
| **Architect** | Designs dimensions, values and starter views from a description | Schema only (optionally a few notes) | `newDimensions`, `newViews`, `newItems` (seed notes) | `schema` scope, plural dimensions |
| **Extender** | Adds a value to a dimension and generates the notes that make its slice resemble its siblings | One dimension, its sibling slices | `newValues`, `newItems` (derived from exemplars) | `slice` scope, `like` derivation, coverage report |
| **Populator** | Fills a schema with notes from nothing, a brief or pasted text | Schema, optional source text | `newItems` (model-placed), `newValues` | Model-chosen coordinates, source-text input |
| **Tidier** | Normalizes messy values | One dimension | `renameValues`, `assign` | `renameValues` change type |
| **Viewsmith** | Designs saved views for a question | Schema, counts | `newViews` | `newViews` change type |
| **Describer** | Writes the descriptions shown in tooltips | Schema, a few notes | `describe` | `describe` change type |
| **Analyst** | Answers questions about the notes, with citations | View or cell | `answer` (read-only) | Citation rendering |

## Shared additions

Several agents need the same new pieces. They are described once here.

### New scopes

| Scope | Notes sent | Used by |
|---|---|---|
| `schema` | **None.** Only dimension labels, kinds, descriptions and value labels | Architect, Viewsmith, Describer (plus a sample) |
| `dimension` | Every note that has a value on the chosen dimension | Tidier |
| `slice` | Notes at one value of one dimension, plus a bounded sample of sibling slices (below) | Extender |
| `doc` | Capped sample across the whole notebook | Populator (optional, "match my existing style") |

`schema` is the most conservative scope Rotor has had: the request contains no note text at all. The preview should say so (`0 notes · schema only`).

The existing 200-note confirmation applies to every scope. Sampling, where used, is deterministic (stable order, evenly spaced) so the preview's note count matches what is sent.

### New change types

Existing: `assign`, `newItems`, `rewrites`, `findings`, `newDimension`, `view`.

| Key | Shape | Meaning |
|---|---|---|
| `newDimensions` | `[{name, kind, note?, values:[{label, note?}], source?, granularity?}]` | Plural form of `newDimension`. `newDimension` stays valid for the Mapper and Planner. |
| `newValues` | `[{dimension, label, note?, after?}]` | New values on **existing** dimensions, flagged ⚑ in review. `after` positions a value on an ordinal dimension (default: append). |
| `newItems` | as today, plus optional `like` or `at` (see *Coordinate derivation*) | New notes. |
| `renameValues` | `[{dimension, from, to}]` | Relabels an existing value. Same effect as double-clicking a header. |
| `newViews` | `[{name, rows, cols, filter?, hide?, cellMode?, sort?}]` | Saved views. Never touches notes. |
| `describe` | `[{dimension, value?, note}]` | Sets the Markdown description of a dimension or a value. |
| `answer` | `{text, cites:[alias]}` | A read-only reply. It is shown, not applied. |

Updated allowlist:

| Agent | Allowed keys |
|---|---|
| architect | `newDimensions`, `newViews`, `newItems` |
| extender | `newValues`, `newItems` |
| populator | `newValues`, `newItems` |
| tidier | `renameValues`, `assign` |
| viewsmith | `newViews` |
| describer | `describe` |
| analyst | `answer` |

### Coordinate derivation

Today agents never choose arbitrary coordinates. The rule "derived coordinates" holds for existing agents. The new agents need two more derivation modes, each with a validator that keeps the guarantee that *the model cannot place a note anywhere the user couldn't see*:

| Mode | Used by | How coordinates are computed |
|---|---|---|
| *inherited* (existing) | Expander | Source note's shared coordinates |
| *shared* (existing) | Synthesizer, others | Coordinates shared by cited sources or by the scope |
| **`like`** (new) | Extender | `like` is an alias of an exemplar note in scope. The new note gets the exemplar's coordinates on every dimension **except** the target dimension, which is set to the target value. The model chooses *which note to imitate* and writes the text. It never writes coordinates. |
| **`at`** (new) | Populator, Architect | The model names coordinates as labels: `{"Status": ["Open"], "Area": ["API"]}`. The validator checks that each dimension exists (or is created in this proposal), is not a date dimension, and that each value exists or is a declared new value. Unknown names are an error, never silently created. |

`at` is the only place a model chooses coordinates directly. It is deliberately limited to agents whose purpose is population, and the review panel shows every placement as a cell address so you can see where each note will land.

### Per-agent limits

The current ceilings (50 new notes, 1–30 values per dimension) are too small for population. Limits become per agent:

| Agent | New notes | New dimensions | Values per new dimension | New values on existing dims |
|---|---|---|---|---|
| architect | 12 (seed notes) | 6 | 1–20 | n/a |
| extender | 100 | 0 | n/a | 5 |
| populator | 100 | 0 | n/a | 10 (total) |
| tidier | 0 | 0 | n/a | 0 |
| viewsmith | 0 | 0 | n/a | 0 (and ≤ 5 views) |

Output is still one request at `max_tokens 4096`, which in practice limits Populator and Extender to roughly 20–40 short notes per run. See *Large runs* below.

### Review panel additions

`renderReview` gains groups, in this order: new dimensions → new values ⚑ → renamed values → new notes (with address) → coordinate changes → descriptions → new views → findings and answers.

- Every change keeps its checkbox. **Dependencies are enforced**: unticking a new dimension or value also unticks, and visibly greys out, every note and view that depends on it. This extends today's "references to unticked values are dropped".
- New notes show their **cell address** (`Planet = Mercury · Aspect = Moons`) so placement is inspectable before accepting.
- Generated factual content carries a standing note: *"Generated by <model>. Verify before relying on it."* Provenance records `{agent, model, at, sources}` as usual.
- A *coverage* line appears for Extender (below).

## 1. Architect: schema and template synthesis

> "Make me an issue management schema."

**Job.** Turn a plain-language description into a set of dimensions, values and (optionally) starter views, ready to rotate immediately.

**Input.** A goal string (required) and a choice of mode:

| Mode | Behaviour |
|---|---|
| *New notebook* | Allowed on an empty or starter notebook. Proposes a complete schema. |
| *Extend* | Sees the existing schema. May only add dimensions and views, never alter existing ones, and must not reuse an existing dimension name. |

**Scope.** `schema`. No notes are sent. This also makes it safe for notebooks with sensitive content.

**Output** (new keys only):

```json
{
  "newDimensions": [
    { "name": "Status", "kind": "ordinal", "note": "Where the issue is in its life.",
      "values": [
        { "label": "Triage" }, { "label": "Open" }, { "label": "In progress" },
        { "label": "In review" }, { "label": "Done" }
      ] },
    { "name": "Priority", "kind": "ordinal",
      "values": [ { "label": "P0" }, { "label": "P1" }, { "label": "P2" }, { "label": "P3" } ] },
    { "name": "Area", "kind": "categorical",
      "values": [ { "label": "API" }, { "label": "UI" }, { "label": "Infra" }, { "label": "Docs" } ] },
    { "name": "Type", "kind": "categorical",
      "values": [ { "label": "Bug" }, { "label": "Feature" }, { "label": "Chore" } ] },
    { "name": "Week", "kind": "date", "source": "created", "granularity": "week", "values": [] }
  ],
  "newViews": [
    { "name": "Board", "rows": ["Priority"], "cols": ["Status"] },
    { "name": "Triage queue", "rows": ["Area"], "cols": ["Type"], "filter": { "Status": ["Triage"] } }
  ],
  "newItems": [
    { "content": "**How to use this board.** Drag a card between columns to change its status.",
      "at": { "Status": ["Triage"] } }
  ]
}
```

**Validation, beyond the shared rules.**

- Dimension names are unique, case-insensitively, against existing dimensions and against each other.
- Value labels are unique per dimension, case-insensitively. This is the existing invariant, and the dry run enforces it.
- Date dimensions must have `values: []`. `source` and `granularity` must be valid, defaulting to `created` and `week`.
- Views may reference only dimensions and values that exist or are declared new in the proposal.
- At most one new dimension may be placed on the Filter shelf by a view. All others must fit on rows and columns.
- Seed notes (`newItems`) are optional and are capped low. They exist only to explain the schema, not to populate it. Use the Populator for data.

**Prompting notes.**

- Ask for **few, orthogonal dimensions** (3–5), because every extra dimension multiplies the cells you can look at.
- Ask for `ordinal` wherever order has meaning (status, priority, severity) and `categorical` otherwise.
- Ask the model *not* to include dimensions that can be derived (dates belong in a `date` dimension, not in a categorical "Month").

**Built-in templates (no AI).** The same schema format is cheap to ship as static data: *Issue tracker*, *Reading list*, *Research notebook*, *Meeting notes*, *Personal CRM*. The Architect reads the same template shape, so a template and an agent proposal are interchangeable. Templates are the fallback when the user is offline or has not connected an account, and a good few-shot library for the Architect's prompt.

**Palette.** `/ai design "issue management for a small team"`.

## 2. Extender: add a value and fill its slice

> "Based on the current document, add *Mercury* to the *Planets* dimension, with all applicable notes generated, so the Mercury slice looks like the others."

**Job.** Add one or more values to an existing dimension and generate the notes that make each new value's slice **structurally match** its siblings'.

This is the most distinctive new agent, because the structure to imitate is already in the notebook and can be measured instead of guessed.

### Worked example

A notebook has *Planet* (Venus, Earth, Mars) and *Aspect* (Facts, Moons, Exploration). Each planet has one or two notes per aspect.

Run: `/ai extend Planet Mercury`.

1. Rotor computes the **slice shape** of each sibling value in code (no model involved): for the sibling slice at Venus, the set of coordinates of its notes on every other dimension.

   | Shape (other dims) | Venus | Earth | Mars |
   |---|---|---|---|
   | Aspect = Facts | 2 | 2 | 1 |
   | Aspect = Moons | 0 | 1 | 2 |
   | Aspect = Exploration | 1 | 1 | 1 |

2. Rotor sends the exemplar notes (aliased) and the target (`Planet = Mercury`).
3. The model returns the new value and, for each note, the exemplar it is modelled on:

   ```json
   {
     "newValues": [ { "dimension": "Planet", "label": "Mercury", "note": "Innermost planet.", "after": "Venus" } ],
     "newItems": [
       { "like": "i2", "content": "Mercury is the smallest planet and orbits the Sun every 88 days." },
       { "like": "i5", "content": "Mercury has no moons." },
       { "like": "i7", "content": "Mariner 10 flew by in 1974; MESSENGER orbited from 2011 to 2015." }
     ]
   }
   ```

4. The validator derives each note's coordinates: the exemplar's coordinates with `Planet` replaced by `Mercury`. The `i5` exemplar is at `Aspect = Moons`, so the new note lands in the Moons row.
5. Review shows a **coverage report**, then the notes.

### Scope

`slice`. What is sent:

- the target dimension's value labels and the user's new value(s);
- the dimension names and value labels of the other dimensions;
- exemplar notes: all notes on **up to 3** sibling values (chosen by most notes first). If that exceeds the 200-note limit, notes are sampled evenly per shape. Each sample keeps at least one note per distinct shape so the structure is represented.

If the target value already exists but has few notes (for example, you added *Mercury* as an empty header earlier), the same run **completes** its slice.

### Coverage report

Computed by a pure function, `sliceShape(doc, dimId, valueId)` (a new module, `model/slices.js`), applied to the doc as it would be after accepting:

```
Planet = Mercury
  Matches 3 of 3 sibling shapes · 3 notes (siblings average 4.3)
  Missing: —
```

- A **shape** is the full coordinate tuple on all dimensions other than the target.
- Missing shapes are a *warning*, not an error. The review panel offers **Run again for missing shapes**, which re-runs with those shapes as explicit targets.
- Shapes in the new slice that no sibling has are flagged ("novel"), because they usually mean the model invented a structure.

### Validation, beyond the shared rules

- Every `like` must be an in-scope alias. `like` on a note outside the sampled exemplars is an error.
- An item may not carry `at`. Placement comes only from `like`.
- With several target values, each item must also name its `value`. With one target value it is implied.
- The target dimension must not be a date dimension, because date values cannot hold coordinates.
- Exemplars with several values on the target dimension (a note tagged both Venus and Earth) are used as shapes, but the new note gets only the new value, never the siblings' values.
- A new value label must not duplicate an existing one on that dimension, case-insensitively. The agent may only *complete* an existing empty value if the user named it.

### Variants (same agent, different trigger)

| Trigger | Behaviour |
|---|---|
| `/ai extend <dim> <new value>` | The example above. |
| `/ai extend <dim> <existing value>` | Completes a thin slice so it matches its siblings. |
| `/ai fill <dim>` | **Gap fill.** Finds the shapes that most sibling values have and some lack, and proposes notes only for those gaps. It adds no values. |
| Right-click header ▸ **Fill like siblings…** | Same, with the target taken from the header. |

### Limits and cautions

- The model supplies content from general knowledge, so factual accuracy depends on it. The review panel's standing warning matters most here.
- For non-factual dimensions (people, projects), the model has nothing to draw on, so the notes it writes are **placeholders**. In that case the prompt instructs it to write short stub notes marked *(draft)* rather than invent specifics.

## 3. Populator: fill a schema with data

> A more freeform version of "add a dimension value": fill in an empty schema.

**Job.** Create notes, placed across a schema the user already has, from nothing, a brief, or pasted material.

### Modes

| Mode | Input | Typical use |
|---|---|---|
| **Sample** | Schema + a topic ("a small SaaS team") + a count | Demo data, trying out a freshly designed schema |
| **Brief** | Schema + a free-text brief | "Populate the Research notebook with what is known about transformer attention variants" |
| **Ingest** | Schema + **pasted source text** (meeting notes, an email thread, an outline) | Break text into atomic notes and place them |
| **Match** | Schema + a sample of existing notes (`doc` scope) | "More like these", staying consistent in tone and granularity |

### Input

The agents panel gains an optional **Source text** field, a multi-line box for Brief and Ingest. Because source text is user-supplied and untrusted, it goes in the user turn, inside a delimited block, with the usual instruction that it is data and not instructions.

The preview and the first-run consent must state that source text is sent, and its character count is included in the token estimate.

### Output

```json
{
  "newValues": [ { "dimension": "Area", "label": "Billing" } ],
  "newItems": [
    { "content": "Invoices show the wrong currency for EU customers.",
      "at": { "Status": ["Open"], "Priority": ["P1"], "Area": ["Billing"], "Type": ["Bug"] } },
    { "content": "Add CSV export to the usage page.",
      "at": { "Status": ["Triage"], "Priority": ["P3"], "Area": ["UI"], "Type": ["Feature"] } }
  ]
}
```

### Validation, beyond the shared rules

- `at` rules as in *Coordinate derivation*. Unknown dimension names are an error.
- New values are limited to 10 in total, and each is flagged ⚑. A run that tries to create many new values is probably a schema-design request, so the error message suggests the Architect.
- **Duplicate guard**: a new note whose normalized text (case, whitespace and punctuation folded) equals an existing note's is rejected. Near-duplicates are only warned about, because the test is cheap and imprecise.
- **Spread check** (warning only): if more than 70% of new notes land in one cell, the review panel says so. This is the most common failure of "sample data" generators.
- Notes are capped per the limits table. In **Sample** mode the requested count is clamped to the same cap.

### Prompting notes

- Instruct the model to **spread** notes across the schema, using each value of each dimension at least once where the count allows.
- Instruct it to keep notes short (one to three sentences) so that more fit in the output budget.
- In Ingest mode, instruct it to preserve the source's wording where possible, to split compound statements into separate notes, and never to invent facts that are not in the text.

### Palette

`/ai populate "brief"`, `/ai populate sample 20`, and an **Ingest…** button that opens the panel with the Source text field focused.

## 4. Tidier: normalize messy values

**Job.** Clean up a dimension that has grown organically: `Open`, `open `, `Opened`, `OPEN`, `Todo`, `To do`.

**Scope.** `dimension`.

**Output.** Only `renameValues` and `assign`. Two cases:

- **Rename**: relabel one value to a cleaner form (`Opened` → `Open`). If the target label already exists, the validator turns the rename into a *merge request* (next point).
- **Merge** is expressed as **reassignment**: notes that carry the old value are `assign`ed the canonical value. The now-empty old value **stays** and appears in the summary as "now empty (delete it yourself from the header menu)". This keeps *deletion not expressible* intact.

**Validation.** The target dimension is the only one touched. `renameValues` may not produce a label that collides with an existing one unless the old value ends up empty (the dry run's label-uniqueness invariant decides). Date dimensions are refused.

**Palette.** `/ai tidy <dim>`.

## 5. Viewsmith: design views for a question

**Job.** Turn "what's blocking the release?" or "who owns what?" into one to five saved views, without changing a single note.

**Scope.** `schema`, plus per-value counts (numbers only, no text) so it can avoid layouts that would be almost empty.

**Output.** `newViews` only:

```json
{ "newViews": [
  { "name": "Blocked P0/P1", "rows": ["Area"], "cols": ["Status"],
    "filter": { "Priority": ["P0", "P1"] }, "hide": { "Status": ["Done"] }, "cellMode": "list" }
] }
```

**Validation.** All dimensions and values must exist. Rows and columns hold disjoint dimensions. A dimension appears on at most one shelf. `filter` maps to `view.pages` and `hide` to `view.excludes`. View names are unique. The projection of each proposed view is computed in the dry run, and a view that would show **zero notes** is flagged *"empty result"* so the user can untick it.

Accepting adds the views but does not switch to one. Navigation stays under user control.

**Palette.** `/ai views "what is blocked?"`.

## 6. Describer: write the tooltips

**Job.** Dimension and value descriptions (the Markdown `note` fields shown as tooltips) are useful but tedious to write. The Describer proposes them for those that are missing.

**Scope.** `schema` plus up to ~3 sample notes per value, so descriptions reflect how values are actually used.

**Output.** `describe` only. Existing descriptions are never overwritten unless the user ticks *Also rewrite existing*, in which case the old and new text are shown as a word diff, the same as Reducer rewrites.

**Validation.** Text length is capped (300 characters). References are resolved by label.

**Palette.** `/ai describe`.

## 7. Analyst: ask the notebook

**Job.** Answer a question about the notes in scope, citing the notes it used. Read-only by construction, like the Critic.

**Scope.** `view`, `cell` or `note`, as for other agents.

**Output.** `answer: {text, cites}`. `cites` aliases map back to real note IDs in the validator. The review panel renders the answer and each citation as a link that selects the note in the grid. The optional **Save answer as a note** (unticked by default) creates a note at the shared coordinates of the cited notes, with a link list of the citations, using the same mechanism as Critic findings.

**Validation.** Every cite must be in scope. An answer with no citations is shown with a *"no sources cited"* label, not rejected.

**Palette.** `/ai ask "which issues mention billing?"`.

## Cross-cutting concerns

### Large runs

One request at `max_tokens 4096` limits how much a run can produce. Options, in order of cost:

1. **Do nothing in v1.** Accept the caps above, and let the user run again. After the first accept, the notebook already contains the first batch, so the second run's Extender / Populator context includes it and avoids duplicates (the duplicate guard enforces this).
2. **Continue button.** After review, offer *Generate more* with the same parameters, carrying forward the aliases of accepted notes so the model can see what exists.
3. **Planned multi-pass runs** (a later step). A run is a list of requests (for example one per sibling shape). Results are merged into **one** proposal and one review, so the undo guarantee holds. The 5-minute overall limit and `Esc` abort still cover the whole run, and cost is shown in the preview before it starts.

### Recipes (chaining)

Common sequences are worth naming:

| Recipe | Steps |
|---|---|
| *Start a project* | Architect → Populator (Sample) → Viewsmith |
| *Grow a taxonomy* | Extender → Tidier → Describer |
| *Import a document* | Architect (Extend) → Populator (Ingest) → Classifier |

A recipe is a sequence of **independent runs**, each with its own review and its own undo step. Nothing is applied between steps without the user accepting it. The panel just pre-fills the next agent after each accept. No agent ever calls another one automatically.

### Privacy: what is sent

Additions to the list in [agents.md](agents.md#what-is-sent):

| Agent | Sent, in addition to the agent instructions |
|---|---|
| Architect | Goal; existing dimension names, kinds and value labels (Extend mode). **No notes.** |
| Extender | Target dimension and values; other dimensions' labels; exemplar notes' text, with coordinates as labels. |
| Populator | Schema; the brief or the **pasted source text**; in Match mode a note sample. |
| Tidier | One dimension's value labels and the text of notes carrying them. |
| Viewsmith | Schema; per-value note counts. **No note text.** |
| Describer | Schema; up to ~3 sample notes per value. |
| Analyst | The notes in scope. |

Still never sent: titles, timestamps, IDs, document and dimension IDs, encrypted notes, other notes, keys, tokens and passwords.

The consent dialog already names the server and note count. For the new agents it should also say whether **pasted text** is included.

### Prompt-injection posture

The new agents widen what a hostile note or pasted document could attempt (for example, a note saying "create a dimension called …" or "put everything in Done"). The same four defences apply:

1. The model has no write access.
2. The validator rejects deletion, out-of-scope references, unknown dimensions, disallowed keys and over-limit output.
3. The dry run enforces the document invariants.
4. A human reviews every change, with new dimensions, new values and **addresses of new notes** all visible.

Specific additions: `at` is accepted only from agents that need it. `like` can only point at in-scope notes. `renameValues` and `describe` are limited to the dimension the user selected (Tidier) or are text-only (Describer). `newViews` can express no data change at all.

### Run log

The same metadata-only fields (time, agent, provider, model, note count, tokens in/out, cost, outcome). New agent names are recorded. For Extender, the target dimension's *name* is **not** logged, because the log never contains content-derived labels.

### Palette summary

`/ai design "<goal>"`, `/ai extend <dim> [<value>]`, `/ai fill [<dim>]`, `/ai populate "<brief>"`, `/ai populate sample <n>`, `/ai tidy <dim>`, `/ai views "<question>"`, `/ai describe`, `/ai ask "<question>"`.

Menu additions: the **Agents** menu gains an *Organize* group (Architect, Tidier, Describer, Viewsmith) and a *Generate* group (Extender, Populator). Header and dimension-chip context menus gain **Fill like siblings…**, **Tidy values…** and **Describe…**.

## Implementation checklist

| Area | Change |
|---|---|
| `model/slices.js` (new, pure) | `sliceShape(doc, dimId, valueId)`, `siblingShapes(doc, dimId)`, `coverage(before, after, dimId, valueId)`, with no DOM, storage or network |
| `model/proposals.js` | New `ALLOW` rows; per-agent limits; validators for `newDimensions`, `newValues`, `renameValues`, `newViews`, `describe`, `answer`; `like` and `at` derivation; duplicate guard; extended `applyChanges` (new dimensions → values → renames → notes → assigns → descriptions → views) |
| `ai/agents.js` | Seven new `AGENTS` entries: prompt, JSON schema, scopes, required inputs (goal, dimension, value, source text) |
| `ai/` runner | Scope builders for `schema`, `dimension`, `slice`, `doc`; deterministic sampling; retry feedback now includes dependency errors (for example an unknown value in `at`) |
| `ui/` agents panel | Inputs for goal, source text, dimension, value and count; schema-only preview; dependency-aware checkboxes; address display; coverage line; *Run again for missing shapes* |
| `ui/palette.js` | New `/ai …` rows in `COMMANDS` |
| `ui/` menus | Agents menu groups; header and chip context items |
| Docs | Move each agent into [agents.md](agents.md) as it ships. Update [shortcuts.md](shortcuts.md) with the commands and [security.md](security.md) if the *what is sent* table changes |

## Testing

These agents are easy to test without a model, because the validator and slice functions are pure. Suggested properties (extending the list in [architecture.md](architecture.md#testing)):

- **No deletion, ever**: fuzzed output for every new agent never yields a key containing `delete` or `remove`, and never loses a note or a value.
- **Closed placement**: every note created through `like` has identical coordinates to its exemplar on all dimensions except the target, and the target is exactly the new value.
- **Closed vocabulary**: with `at`, every dimension and value referenced exists in the document or is declared new in the same proposal.
- **Dependency integrity**: unticking any subset of changes always yields a document that passes `assertInvariants()`.
- **Idempotence of coverage**: applying an Extender proposal and recomputing `sliceShape` gives coverage ≥ the pre-accept estimate.
- **Schema scope sends no text**: the serialized request for `schema`-scope agents contains no note `content`.
- **Tidier is non-destructive**: dimension and value counts never decrease after applying a Tidier proposal.
- **Views are data-neutral**: `newViews` leave `items` byte-identical.
- **Adversarial notes** (`ignore your instructions…`, `</script>`, very long labels) never change which keys the validator accepts.

## Open questions

- **Value ordering for the Extender.** Should the new value be placed by the model (`after`), by the user, or always appended? Appending is predictable. For ordinals, `after` matters.
- **Cost transparency for chained runs.** Should the panel show a running cost for a recipe?
- **How much factual content should Rotor be willing to generate?** The Extender's planets example is benign, but a "fill like siblings" over a *Clients* dimension would write fiction. The *(draft)* stub convention is the proposed mitigation. A stricter alternative is to refuse generation unless the user ticks *Content may be invented*.
- **Template sharing.** Should an accepted Architect proposal be exportable as a `.rotor` template with no notes, so teams can share schemas? It requires no new format, since a notebook with zero items already is one.
- **Per-agent default models.** Cheaper models are fine for Tidier and Describer. The Extender and the Analyst benefit from stronger ones.