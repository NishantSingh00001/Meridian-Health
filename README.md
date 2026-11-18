# Customer Data Bridge

**A field-mapping and crosswalk engine for syncing customer records between
two systems that don't agree on field names, types or enum values** — e.g.
NetSuite's 4-digit tax region codes vs a billing system's ISO zone strings.
Define a mapping once, validate it statically, then run batches of raw
records through it and get back mapped output plus a precise exception list
for anything that didn't resolve.

**Author:** [Nishant Singh](https://nishant-singhaa0240274.netlify.app)

> This repo is at the **scaffold stage**: the core mapping engine
> (`lib/mapping.ts`) and the Supabase schema (`supabase/schema.sql`) are real
> and unit/integration-tested, but there is no deployed API or auth flow yet.
> `index.html` is a static UI demo/mock, not a live app. See
> `SECURITY_REVIEW.md` for what that does and doesn't mean for security.

## What it does

- **`validateMapping()`** — checks a single field mapping is well-formed
  before any sync runs: source/target both present, and any mapping that
  touches an enum-like type has an explicit, non-empty crosswalk table
  (matching type names doesn't mean matching value domains).
- **`resolveField()`** — applies one mapping to one raw value: passes
  through, resolves via the crosswalk, or raises a typed exception
  (`"required but missing"`, `"no crosswalk entry for ..."`) without
  throwing, so a sync can keep going and report every exception at once.
- **`syncBatch()`** — runs a batch of raw records through a set of mappings,
  returning both the mapped records and the full exception list (which
  field, which record index, why). A record with a missing *required* field
  is dropped from `mapped`; everything else is best-effort.

## Data model

`supabase/schema.sql` defines `workspaces`, `connectors`, `field_mappings`,
`sync_runs` and `exceptions`, each (other than `workspaces` itself) scoped
by a `workspace_id` enforced with Postgres row-level security policies
derived from the caller's JWT — never from a client-supplied value.

## Run it

```bash
npm install
npm test            # lib/mapping.ts unit tests
npm run test:integration   # tests/integration/sync.integration.test.ts
npm run test:all
```

No environment variables are required to run the tests — the integration
test uses a `FakeSupabase` mock, not a real database. `.env.example` lists
what a real deployment will eventually need (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, the latter server-only).

## Tech stack

TypeScript (framework-free core logic) · Jest · Supabase/Postgres (schema +
RLS) · static HTML/CSS demo UI, no framework yet.

## Status / roadmap

See `SECURITY_REVIEW.md` and `LOAD_TEST_NOTES.md` for what's built, what's
deliberately deferred (API routes, auth, upload limits, AI-assisted
crosswalk suggestions), and what to re-check once this goes from scaffold
to a deployed app.

## License

Personal project — all rights reserved unless a `LICENSE` file says
otherwise.
