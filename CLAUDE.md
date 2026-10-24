# Security rules — read before touching this repo

1. **No secrets in frontend code.** `SUPABASE_SERVICE_ROLE_KEY` is server-only.
   Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key may appear in client code.
   Grep for `NEXT_PUBLIC_` before adding any new env var to confirm it's meant
   to be public.
2. **No data access without RLS.** Every new table gets `enable row level
   security` and a `workspace_id`-scoped policy in the same migration that
   creates it — not as a follow-up.
3. **No unlimited uploads.** Any file/record upload endpoint must cap size and
   count server-side (not just in the UI) before this is wired to a real
   upload surface.
4. **No paid feature left unchecked server-side.** If a feature is gated by
   plan/seat, the check must happen in the API route or RLS policy, never only
   in the client UI.
5. **No uncapped AI/agent endpoints.** Any route that calls an LLM needs a
   per-workspace rate limit and a max-tokens ceiling before it ships.
6. New code touching `lib/mapping.ts` needs a failing test first (TDD) — see
   `lib/__tests__/mapping.test.ts` for the existing contract.
7. `.env` is gitignored; `gitleaks` runs on every push and PR via
   `.github/workflows/gitleaks.yml` — a failing scan blocks merge.
