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
| `lib/leadActions.ts` | rules shared by both views (priority edge, category label) |
| `lib/tones.ts` | the colour code rendered as classes, fills and icons |
| `lib/marketingExport.ts` | derived campaign columns, CSV serialisation, GDPR gate |
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

### Marketing export

`lib/marketingExport.ts` serialises **the list currently on screen** — same filters, same
period, same sort — into a CSV. It has no selection logic of its own, deliberately: a
second set of rules would drift from the view's.

- **Consent gates the export, and nothing else does.** `eligibleForCampaign` keeps only
  records whose GDPR checkbox is `true`. A cleared box and a legacy row with an empty
  column are indistinguishable in Airtable, so both are dropped. The count of excluded
  rows is shown next to the button *before* the click — an export shorter than the list
  with no explanation reads as a bug.
- The webhook only started writing `gdprConsent` on 2026-08-26, so nearly every
  historical contact request has it empty. At the time of writing: **2 of 440** contact
  requests carry consent, against **249 of 343** solar leads. The feature is correct; the
  contact table simply has no consent history to export yet.
- Derived columns — segment, department, age, month, quarter — are computed here and
  written nowhere. They are views of the data, not data.
- `toCsv` writes a UTF-8 BOM (Excel reads the file as ANSI without it), uses `;` and CRLF,
  and prefixes cells starting with `=` or `@` with an apostrophe. The data comes from a
  public form, so a `=HYPERLINK(…)` in a name field would otherwise be evaluated on open.
  Purely numeric values are left alone, so `+33…` phone numbers keep no stray apostrophe.
- Downloads need `allow-downloads` on the Softr iframe. A blocked download fails
  silently, with no exception to catch — which is why the UI reports the row count.

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
