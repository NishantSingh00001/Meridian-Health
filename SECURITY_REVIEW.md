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

## 20-point pen-test checklist (2026-11-19)

Same scope note as above: this is a scaffold with no deployed API and no
auth flow, so most of the 20 points have no live code path to assess yet.
Reviewed `lib/mapping.ts`, `supabase/schema.sql`, `index.html`.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | HTTP/2 Rapid Reset | N/A | No deployed server. |
| 2 | bcrypt 72-byte limit | N/A | No password hashing in this scaffold (auth is expected to be Supabase Auth, not yet wired). |
| 3 | SAML signature bypass | N/A | No SAML. |
| 4 | nOAuth | N/A | No OAuth flow built yet. |
| 5 | GraphQL alias batching | N/A | No GraphQL. |
| 6 | TOTP replay | N/A | No TOTP/2FA. |
| 7 | ReDoS | N/A | No regular expressions anywhere in `lib/mapping.ts` or the static `index.html` script. |
| 8 | JWT algorithm confusion | N/A (forward-looking) | RLS policies read `auth.jwt() ->> 'workspace_id'`, which trusts Supabase's own JWT verification (Supabase Auth, GoTrue) rather than re-implementing it — there's no app code here that parses or verifies a JWT itself, so there's no algorithm-confusion surface to exploit yet. |
| 9 | HTTP request smuggling | N/A | No deployed server. |
| 10 | Web cache poisoning | N/A | No deployed server/responses to cache. |
| 11 | Spoofed X-Forwarded-For | N/A | No IP-based logic anywhere in this scaffold. |
| 12 | Postgres views bypassing RLS | **Watch item** | `schema.sql` enables RLS on `connectors`, `field_mappings`, `sync_runs` and `exceptions`, each with a `workspace_isolation_*` policy — correct. `workspaces` itself has **no RLS enabled** (it has no `workspace_id` column to scope by; it *is* the workspace). This is fine today since nothing queries it directly from client code, but when an API route is built, confirm the `workspaces` table is only ever read via a policy keyed on org/user membership (not left open by omission) and that no SQL *view* is added later that joins these tables without its own RLS, which would silently re-expose cross-workspace rows even with the base tables locked down. |
| 13 | `Math.random()` for security tokens | No | No tokens generated in app code; `schema.sql` uses Postgres's `gen_random_uuid()` (cryptographically random) for every primary key. |
| 14 | Timing attacks on secret comparison | N/A | No secret comparison in this scaffold. |
| 15 | Padding oracle | N/A | No encryption/decryption. |
| 16 | Server-side prototype pollution | No | `syncBatch()`/`resolveField()` build each mapped record by assigning named fields (`out[mapping.target] = value`) from a fixed, caller-supplied `FieldMapping[]` — not by spreading or merging an arbitrary untrusted object, so there's no `__proto__`-style injection path even once this is wired to a real endpoint, as long as the mapping definitions themselves come from a trusted admin/config path rather than directly from request bodies. |
| 17 | Server-side template injection | N/A | No templating engine. |
| 18 | XXE | N/A | No XML parsing. |
| 19 | Cross-site WebSocket hijacking | N/A | No WebSocket endpoint. |
| 20 | Unicode username normalization | N/A | No usernames/login built yet. |

### Summary

No exploitable findings — there's no deployed attack surface yet, consistent
with the scope note above. One forward-looking watch item: confirm the
`workspaces` table and any future SQL views stay properly scoped once API
routes are built, since RLS on the four child tables alone doesn't
automatically protect a view that joins across them. Re-run this section
once a real API and auth flow exist.
