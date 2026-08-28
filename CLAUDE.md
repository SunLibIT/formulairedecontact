# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server
npm run typecheck    # tsc on src/ AND api/ — the real gate
npm run lint
npm test             # vitest run
npm run test:watch
npm run build
```

`npm run build` **does not typecheck**. Vite strips types without checking them, so a
broken import compiles cleanly and ships. Always run `npm run typecheck` — it covers
`src/` and `api/` through two separate tsconfigs.

Single test file or single case:

```bash
npx vitest run src/lib/format.test.ts
npx vitest run -t "formatPhone"
```

Tests default to the Node environment. Files needing a DOM declare it themselves with
`// @vitest-environment jsdom` on the first line — global config for this changed shape
between Vitest versions, the annotation does not. `globals: true` is set because
testing-library registers its cleanup on the global `afterEach`; without it renders
accumulate between tests.

## Architecture

A read/write dashboard over Airtable, embedded as an iframe in Softr. There is no
database and no server state of its own.

```
Typeform ──webhook──► api/typeform-webhook ──► Airtable
                                                 ▲
              src/ (React) ──► api/airtable ─────┘   token stays server-side
```

### Layers, and why they are separate

| Layer | Responsibility |
| --- | --- |
| `lib/schema.ts` | table and field **ids**, select options, status→tone map. Single source of truth |
| `lib/airtable.ts` | transport: pagination, upsert, batched writes, 429 retry, proxy-or-direct |
| `lib/records.ts` | normalises both Airtable tables into one `Lead` type |
| `lib/filters.ts` | filtering, sorting, counters |
| `lib/kpi.ts` | distributions, summary, per-assignee load, period comparison |
| `lib/dates.ts` | calendar-day arithmetic. The only module that knows about time zones |
| `lib/geo.ts` | postal code and department normalisation |
| `lib/territories.ts` | sales territories: department → sales rep, staff options for a lead |
| `lib/leadActions.ts` | rules shared by both views (priority edge, category label) |
| `lib/tones.ts` | the colour code rendered as classes, fills and icons |
| `lib/csv.ts` | CSV serialisation, French number formats, download |
| `lib/duplicates.ts` | spots repeat requests from one address; never merges |
| `lib/merge.ts` | fills the kept request from its duplicates, archives the rest |
| `lib/marketingExport.ts` | derived campaign columns, dedup on email |
| `lib/kpiExport.ts` | dashboard indicators as a long table |
| `hooks/` | loading, staff cache, view preference, selection, dialog mechanics |
| `components/` | presentation only |

**The two views are presentational.** Filters, sort, selection and pagination live in
`App.tsx`, above them. That is what makes state survive a list/grid switch, and it is a
constraint to preserve — a view that owns filter state breaks the switch.

Card and row share every behavioural rule through `lib/leadActions.ts`. Only the markup
differs, which is legitimate: an `<article>` in a grid and a virtualised row are not the
same structure.

### Airtable access

Fields are addressed **by id** (`fld…`) with `returnFieldsByFieldId=true`, never by name.
This base has been renamed repeatedly; names are not stable. The one exception is
`filterByFormula`, which only accepts field names — hence `FIELD_NAMES` in `schema.ts`.

- `Assigné à` is a **link field**. Write an array of record ids, never a string.
- `typecast` stays `false` everywhere. An unknown select option must fail loudly rather
  than be silently created — that is how the legacy table ended up with ~170 parasitic
  `Statut` options, including timestamps.
- Status and priority are written as the exact French labels in `STATUSES` / `PRIORITIES`,
  accents included. They must match the Airtable options character for character.
- Write limits: **10 records per request, 5 requests per second per base.** Bulk writes go
  through `updateRecords`, which batches, spaces, reports progress and accepts an
  `AbortSignal`. 200 rows takes about five seconds — never block the UI on it.

### Vercel functions — two traps that cost real debugging

**Handler signature.** Export **named HTTP methods**, not a default export. Vercel's Node
runtime treats a default export as `(req, res) => void` and *ignores the returned value*,
so `export default (req: Request) => Response` never answers. The proxy silently returned
nothing for a while because of this.

```ts
export function GET(req: Request): Promise<Response> { … }
export function PATCH(req: Request): Promise<Response> { … }
```

**ESM extensions.** Relative imports inside `api/` need `.js`, e.g.
`from './_lib/airtable.js'`. Vercel compiles to ESM and Node does not resolve extensions
implicitly there. TypeScript maps `.js` back to `.ts`, so the source is unaffected.

**The proxy is a static path.** `api/airtable.ts`, with the target in the query string
(`?table=…&record=…`). A catch-all `api/airtable/[...path].ts` answered for one path
segment and 404'd for two, which broke every single-record write while listing kept
working — so the app looked healthy. Do not reintroduce path segments there.

### Typeform webhook

`api/_lib/typeform.ts` holds one ref UUID **per form branch** — the forms have conditional
logic, so Particulier, Entreprise, Installateur and Collectivité ask for the same email
through different questions. `findAnswer` tries the refs in order.

Editing a question in Typeform changes its ref, and the field then arrives **empty with no
error**. Any form change means checking this file. The handler logs `mapping suspect` with
the received refs when a delivery resolves nothing, which is what you need to extend
`FIELD_REFS`.

`TYPEFORM_SECRET` is a shared secret **you invent**, not a token Typeform issues. It goes
in Vercel and in each form's webhook settings. Note that Typeform's *Send a test request*
button sends **no signature at all** — a 401 there is correct behaviour, not a bug.

### Environment

| Variable | Where |
| --- | --- |
| `AIRTABLE_TOKEN` | Vercel, server-side |
| `AIRTABLE_BASE_ID` | Vercel, optional |
| `TYPEFORM_SECRET` | Vercel + each Typeform form |
| `VITE_AIRTABLE_TOKEN` | **local `.env` only** |

`VITE_AIRTABLE_TOKEN` makes the front call Airtable directly, for working without
`vercel dev`. Any `VITE_` variable is compiled into the browser bundle, so it must never
be set in production; a banner in the UI warns when it is present. Variables are injected
at build time — adding one requires a redeploy.

The repository is **public**. `.env.example` carries variable names only.

Deployment Protection must stay **off**: with Vercel Authentication on, `.vercel.app` URLs
demand a login, which breaks both the Softr iframe and the Typeform webhook.

### Softr embedding

The app runs in a **third-party iframe**, which has two consequences worth remembering:

- `localStorage` may be partitioned or throw on access alone. Every access is wrapped;
  treat a lost preference as normal, never let it throw.
- Viewer identity comes from `?email=`, which Softr injects. `useViewer` matches it against
  the RH table. That is what enables "M'assigner". No email means no identity — a normal
  case, not an error.

### KPI — three rules that were learned the hard way

`lib/kpi.ts` is pure and takes the already-loaded `Lead[]`; the KPI tab issues no request of
its own. Every figure it produces is wrong *silently* when it is wrong, which is why the
three rules below are rules and not preferences. All three were violated at once, and the
resulting numbers were reported as "incohérences" before anyone could name the cause.

**Percentages divide by coverage, never by the total.** `countBy` drops empty values, so
dividing by `leads.length` yields bars that never sum to 100. That is not a rounding
artefact: 283 of 440 contact requests carry no `motive`, so every share on that chart read
at roughly a third of its true value. `countBy` therefore returns a `Distribution`
— `{ slices, covered, total }` — and `covered` is the denominator. Charts state their
coverage in the subtitle ("157 demandes renseignées sur 440"); a chart that hides how much
data it is missing is worse than one with no chart. Only "Répartition par statut" uses the
total, because it has no gap by construction.

**Day arithmetic goes through `lib/dates.ts`, never through milliseconds.** A period bound is
a `YYYY-MM-DD` *label*, not an instant. Parsing it as local time and re-emitting it with
`toISOString()` — which is UTC — moves it back one day in Paris, and subtracting a span in
milliseconds loses another across a DST change. `previousPeriod` did both: August compared
against `30 June → 30 July`. `dayNumber`/`dayIso` stay in UTC end to end; `isoDay`/`todayIso`
are the only functions that look at the reader's time zone, because "today" is the only
genuinely local notion here. `vitest.config.ts` pins `TZ=Europe/Paris` — without it these
tests pass on a UTC machine and the bug ships.

**Period bounds are inclusive on both sides.** `applyPeriod` includes both `from` and `to`, so
a 7-day window starts `today - 6`. The preset shortcuts got this wrong and covered eight days
under a "7 jours" label. `PRESET_DAYS` and `startOfWindow` in `PeriodFilter.tsx` are the
single source; `presetFor` reads them too, so the active shortcut cannot drift from the range
it sets.

Two smaller invariants worth keeping:

- `summarise` counts a status outside `STATUSES` in `unknownStatus` and excludes it from
  `handledRate`. The base is clean today and was not always: an import once created ~170
  parasitic `Statut` options. An unreadable status is not a handled one.
- Ageing (`medianUntouchedAge`, `staleCount`) is measured against *now*, on a set already
  restricted to the period. On a past period every request is trivially older than the
  threshold — the tile says so rather than pretending otherwise.

`lib/kpi.test.ts` and `lib/dates.test.ts` pin all of the above. They did not exist while the
bugs did, which is the whole story.

### Exports

Two CSV exports, both serialising **what is currently on screen** — same filters, same
period, same sort. Neither has selection logic of its own, deliberately: a second set of
rules would drift from the view's. `lib/csv.ts` holds the shared serialisation.

#### `lib/csv.ts`

- Writes a UTF-8 BOM (Excel reads the file as ANSI without it), uses `;` and CRLF.
- Prefixes cells starting with `=` or `@` with an apostrophe. The data comes from a public
  form, so a `=HYPERLINK(…)` in a name field would otherwise be evaluated on open. Purely
  numeric values are left alone, so `+33…` phone numbers keep no stray apostrophe.
- `frNumber` / `frPercent` emit a **decimal comma**. Not cosmetic: in a French locale
  Excel reads `42.5` as text, and a text column will not sum.
- Downloads need `allow-downloads` on the Softr iframe. A blocked download fails silently,
  with no exception to catch — which is why both buttons report a count.

#### `lib/marketingExport.ts` — contact list

- **Consent does not filter the export**, by explicit product decision. Every row on
  screen is exported. A `Consentement RGPD` column reports Oui/Non per row, so the
  information is in the file without gating it — whoever sends a campaign decides what to
  do with it.
  The earlier behaviour gated the export on consent, which made the contact tab export 2
  rows out of 440 and read as a breakage: the webhook only started writing `gdprConsent`
  on 2026-08-26, so nearly every historical contact request has it empty. For reference:
  **2 of 440** contact requests carry consent, against **249 of 343** solar leads.
- **One row per person.** `dedupeByEmail` merges repeat requests on the normalised email
  and keeps the **most recent** one, because every derived column describes a specific
  request — keeping an arbitrary one would segment someone on a stale state. A `Demandes`
  column carries how many requests the row stands for, which doubles as an interest signal.
  Rows without an email are never merged with each other: they share no key. Real data: 440
  contact requests collapse to **379 rows** (61 merged), and 249 consenting solar leads to
  **214** (27 addresses repeat, one of them four times).
- Derived columns — segment, department, age, month, quarter — are computed here and
  written nowhere. They are views of the data, not data.

#### `lib/kpiExport.ts` — dashboard

- Reuses `lib/kpi.ts`'s aggregation functions, the same ones the tab renders. There is no
  second qualification-rate calculation here, only a layout of the first — that is what
  keeps file and screen from disagreeing.
- **Long table**, four columns (`Bloc;Indicateur;Valeur;Part (%)`), not a wide one. A long
  table pivots, filters by block, and takes a new indicator without rewriting the header; a
  wide table would need one column per month and per assignee, so its shape would change
  with every period extracted.
- A `Contexte` block opens the file with source, assignee and period. KPIs out of their
  scope are not interpretable — « 440 demandes » says nothing without knowing over what.
- Distributions are divided by their **coverage**, not the total, exactly as on screen: 283
  of 440 contact requests carry no motive, so dividing by 440 would give parts that never
  sum to 100 %. Coverage is written out as `Renseigné` / `Non renseigné` so the denominator
  is checkable. Unlike the charts, no tail is folded into « Autres » — a file is where you
  go to find the tail.
- `Statut non reconnu` is exported even at zero: it is an integrity check, since those rows
  count in the total but in no status.

### Sales territories

Since 2026-08-27 the base carries **Sectorisation commerciale**
(`tblw11IuaIggSkNu5`): one row per metropolitan department — 95 rows, 8 sales reps — with
the rep who covers it as a **link** to RH. Nothing of the sort existed anywhere before; do
not confuse it with the « Département couvert » fields on the installer tables, which
describe partner fitters, not reps.

`lib/territories.ts` reads it and answers one question: *who covers this request?* It never
writes. The sector is a recommendation surfaced in the UI — it is not copied onto the lead,
and it does not constrain what gets written.

- **Two conventions come from the table itself.** `Code département` is **text**, two
  characters, leading zero included (« 01 »): a number would be pre-filled to 0 by an
  Airtable n8n node in update / defineBelow mode and the codes would be wiped. Corsica is
  « 20 », not 2A/2B, to match the `Département` field on contact requests, which is only
  the first two digits of the postal code. `sectorKey` folds a stray 2A/2B back to « 20 »
  so such a row could still be matched.
- **Matching is on two characters, on both sides.** `departmentFromPostalCode` returns
  three digits overseas, where the department genuinely is 971…978, while the Airtable
  column holds two. Both are truncated to two, so a 974 request looks up « 97 » — which
  matches nothing, since the DOM are not sectorised. The modal says so (« département 97,
  hors sectorisation ») rather than proposing a metropolitan rep at random. Adding a « 97 »
  row, or a fallback, is still open.
- **A lead's department goes through `departmentCodeOf`**, field first and postal code as
  fallback: solar leads have no `Département` column, and part of the historical contact
  import has it empty while the postal code is filled.
- **The three places that list staff share `staffOptionsFor`**: the assign modal, the full
  record and the bulk bar. It marks the sector rep as `pinned`, hints « Secteur 33 » on
  that row and the covered departments on the others — in an assignment list a territory
  says more than « Commercial », and a role least of all, so no `group` fallback: a
  non-sectorised colleague gets no hint at all. Codes are listed in full, never
  abbreviated to « 01, 03, 07 +9 »: the question being asked is « does this person cover
  the 63? », and the display truncates if it must. `SearchableSelect` keeps its
  alphabetical sort *inside* each group, so pinning splits the list in two instead of
  reordering it.
- **The list is searched by department number** — that is the actual gesture: read the
  customer's department, type it, assign whoever covers it. The sector rep's hint reads
  « Secteur 33 », so typing « 47 » would have excluded them from their own list; their
  codes therefore travel in `SelectOption.keywords`, searched but not displayed.
  `SearchableSelect.test.tsx` pins it.
- The bulk bar only pins when the **whole selection shares one sector**. On a mixed batch
  the pin is dropped: highlighting one department's rep would steer the assignment of rows
  that belong to the others.
- Like every other table, it has to be listed in `ALLOWED_TABLES` in `api/airtable.ts`,
  or the proxy refuses to serve it.
- The table is cached at module level like RH — 95 rows that change when the sales
  organisation changes. A load failure is swallowed on purpose: the UI loses the sector
  hint and stays usable, which beats an error banner over a secondary signal.

### Duplicate requests

`lib/duplicates.ts` **spots** repeat requests sharing an email address. It never merges
and never writes — that is the whole point.

- The index is built on the **entire table**, never on the filtered list. Filtering to
  « Qualifié » and then looking for duplicates would hide the « Hors Critères » twin,
  which is exactly the case worth seeing.
- Real data, contact tab: **37 addresses** carry 98 rows, so 61 surplus — 31 people with
  two requests, 2 with three, 3 with four, and one address with **18**.
- **No automatic merge, deliberately.** On 19 of those 37 groups the statuses contradict
  each other (« Qualifié » against « Hors Critères »), so a « keep the most recent » rule
  would destroy a sales decision. Only a human knows which one counts. The filter groups
  them and marks the latest; the arbitration stays manual.
- Grouping is applied **after** sorting, so clicking a column header still reorders both
  the groups and the rows inside them. A regrouping that overrode the sort would make the
  headers look broken.
- Rows with no email are never grouped together: no shared key means no evidence they are
  the same person.
- `DuplicateBadge` carries a third shape — outlined, no coloured fill — because status and
  priority already own the two axes of the sales pipeline. Only the most recent request
  goes teal.

### Merging duplicates

`lib/merge.ts` turns a duplicate group into a plan, `MergeModal` shows the plan, and
`applyMerge` in `App.tsx` writes it. The rule is one sentence: **fill, never overwrite.**

- The most recent request is kept and receives only the fields it leaves **empty** and an
  older one had filled. The others go to « Archivé ».
- **Status and priority are never carried over.** They are sales decisions, and on 19 of
  the 37 real groups they contradict each other — carrying them would let a July
  « Hors Critères » overwrite an August « Qualifié ».
- **Nothing is deleted.** Everything is a `PATCH`, so the proxy keeps its two methods and
  the operation is undone by giving the archived rows their status back. This was a
  deliberate choice over real deletion, which would have meant opening `DELETE` on a
  public unauthenticated proxy (Deployment Protection must stay off for Softr and
  Typeform).
- `planMerge` returns `null` on a heterogeneous group — different addresses, different
  tables, fewer than two rows. The same call decides whether the button appears, so no
  button ever offers a merge the write would refuse.
- `plan.merged` is the kept request as it will be **after** the write. `App` patches it
  locally instead of reloading 440 rows, and since the plan produces it, screen and
  database cannot disagree.
- Archived rows leave the duplicate index (`buildDuplicateIndex` skips « Archivé »),
  otherwise the filter counter would never drop and the work done would stay invisible.
- Measured over the 37 real groups: 61 rows archived, but only **6 groups actually gain a
  field** (4 « Société », 2 « Partenaire »). Typeform asks the same questions every time,
  so the newest request is usually already as complete as the old ones — the value of the
  feature is the archiving, not the field transfer. The modal says so rather than
  implying a transfer that will not happen.

### Archiving one duplicate

Merging is the heavy answer to a repeat request. The light one — most groups need nothing
transferred — is to archive the surplus row where you see it. `archiveDuplicate` in
`App.tsx` writes one field, `Statut` → « Archivé », and patches the row locally. No
`DELETE`, same as everywhere else.

- **The button exists only on a row the index has marked.** `duplicates.marks.get(id)`
  gates the badge, the record's block and the write path alike, so nothing offers to
  archive a request that is not a repeat.
- **Two clicks, always.** `DuplicateBadge` turns into « Archiver ? ✓ ✗ » in place; the
  record dialog asks the same question with a Confirmer / Annuler pair. The badge lives
  inside a clickable card and a clickable row, so it stops propagation on every click —
  without that, confirming would open the record over the confirmation. And an archive
  fired by a stray click is invisible: the row leaves the list immediately.
- **Archiving the most recent request is allowed.** Sometimes it is the junk one. The
  badge only says so in colour, so `duplicateNote` carries an `archiveLabel` that names
  which one the button is about — that is what a screen reader announces.
- **`applyFilters` hides « Archivé » unless the status filter asks for it.** That is what
  makes archiving feel like archiving; the status dropdown is the way back, which is why
  `computeStats` keeps counting archived rows in `byStatus` while excluding them from
  `total`, `byPriority` and `unassigned` — otherwise « Toutes (440) » would promise rows
  the list never shows.
- `lib/kpi.ts` still counts archived requests: the KPI tab measures what came in, not
  what is left to handle. Screen and dashboard therefore differ by the archived count —
  deliberate, and worth revisiting if the archive ever grows large.

### Colour and icons

The colour code is declared once in `STATUS_TONE` (`schema.ts`) and rendered by
`lib/tones.ts`. Badges, stat tiles, chart bars and row edges all read from it, so a tone
change propagates everywhere. `StatTile` even derives its icon from its tone, which makes
divergence impossible rather than merely discouraged.

`A contacter` and `A relancer` share the amber hue at two steps — they are a progression,
not two categories, so the reader sees the order in the colour. Both carry distinct icons
so the distinction never depends on perceiving a shade.

Charts follow the `dataviz` skill: nominal bars carry a single hue, status colours are
reserved and always paired with an icon and a label, and there are no dual-axis charts.
The brand green measures 2.75:1 on white, under the 3:1 mark threshold, which is why every
status bar shows its value as a visible label.

Design tokens come from the internal SunLib charter (Notion → Standards & Références): the
brand gradient is reserved for the primary action, and an active element never carries a
border or rule — teal alone marks it.

Dark mode is driven by `prefers-color-scheme` only; there is no toggle. Values are chosen
and contrast-checked against the dark surface, not inverted.

### scripts/

Python, stdlib only. `repair-xlsx.py` rebuilds the historical contact requests from a
corrupted Excel export (two exports concatenated, one a raw CSV dump collapsed into a
single column); `upload-to-airtable.py` loads them with an idempotent upsert on
`Response ID`. `scripts/records.json` holds personal data and is gitignored.
