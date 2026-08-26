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
| `lib/leadActions.ts` | rules shared by both views (priority edge, category label) |
| `lib/tones.ts` | the colour code rendered as classes, fills and icons |
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
