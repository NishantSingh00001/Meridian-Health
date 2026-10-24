# Security review — Customer Data Bridge (scaffold stage)

Scope: `lib/mapping.ts`, `supabase/schema.sql`, repo hardening kit.
This is a honest review of what exists right now — the UI pages are still a
static demo artifact, so most of this is forward-looking for when real API
routes get built on top of `lib/mapping.ts`.

## 1. Secrets in frontend code
**Status: not yet applicable / pre-empted.** No frontend API calls exist yet.
`.env.example` documents that `SUPABASE_SERVICE_ROLE_KEY` is server-only.
**Action when building API routes:** never import the service-role client
into any file under a client component boundary; use it only in
`app/api/*/route.ts` or server actions.

## 2. Data access without rules
**Status: addressed in schema, not yet wired to app code.**
`schema.sql` enables RLS on all four tables and scopes every policy to
`workspace_id` from the JWT. **Gap to close before launch:** write a test
that attempts a cross-workspace read with a real Supabase client (not the
`FakeSupabase` mock) and confirms it returns zero rows — the current
integration test proves the *mapping logic* respects workspace boundaries,
not that Postgres itself does.

## 3. Unlimited uploads
**Status: not yet applicable.** No upload endpoint exists in this scaffold.
**Action when built:** cap file size and record count server-side (e.g. in
the API route, not just a client-side `accept`/`max` attribute), and reject
batches above a hard ceiling (suggest starting at 50k records/request given
the batch-size smoke test below).

## 4. Paid features unchecked server-side
**Status: not applicable yet** — no billing/plan gating exists in this
scaffold. Flag for when it's added: the check belongs in the API route or an
RLS policy, never only in a UI `disabled` attribute.

## 5. Uncapped AI/agent endpoints
**Status: not applicable yet** — no LLM-backed endpoint exists in this
scaffold (the product's own "suggest crosswalk" button in the UI is currently
a static mock with no backend call). Flag for when it's wired up: per-workspace
rate limit + max-tokens ceiling before it ships, per `CLAUDE.md` rule 5.

## What this review does NOT cover
A pentest implies a running target. This scaffold has no deployed instance,
no live API surface, and no auth flow yet — there's nothing to attack. Treat
this as the pre-launch checklist, not a pentest report. Re-run this review
once API routes and auth exist.
