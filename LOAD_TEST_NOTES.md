# Load testing — capacity notes

There is no deployed instance of this app, so "simulate 5,000 users" can't be
done honestly right now — there's no server to send traffic to. What's below
is (a) what the current code's own numbers already tell us, and (b) a real
script to run against a deployment once one exists.

## What the unit tests already tell us
The `syncBatch` smoke test processes 10,000 records in-process with no
measured slowdown — the mapping logic itself (pure functions, no I/O) is not
the bottleneck. At 5,000 concurrent users, the bottlenecks will be:

1. **Supabase connection pool exhaustion** — Postgres has a hard connection
   ceiling; 5,000 concurrent requests each opening a connection will exhaust
   it long before CPU is the limit. Mitigation: use a pooler (Supabase's
   built-in pgbouncer / `pooler` connection string), not direct connections,
   from any serverless route.
2. **Serverless cold starts** — if API routes run on Vercel's default
   serverless runtime, a burst of 5,000 new concurrent invocations will hit
   cold-start latency on a meaningful fraction of them.
3. **N+1 queries in the sync endpoint** — once `syncBatch` output is
   persisted record-by-record instead of in one batched insert, write
   latency will dominate. The schema and integration test above assume
   batched inserts; confirm the real API route does the same.
4. **Unbounded batch size** — nothing currently caps how many records one
   sync request can carry (see `SECURITY_REVIEW.md` #3). Under load this is
   both a stability and a cost risk.

## Script to run once deployed
```js
// k6 run load-test.js  (requires a real deployed URL)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 500 },
    { duration: '3m', target: 5000 },
    { duration: '2m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://YOUR-DEPLOYED-URL/api/sync-status');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```
Run this against a staging environment, not production, and watch Supabase's
connection-pool metrics alongside it — that's where this app will break
first, not the application code.
