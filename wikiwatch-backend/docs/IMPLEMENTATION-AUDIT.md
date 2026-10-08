# WikiWatch consistency and resource safeguards

The connected application uses the API as the authority for identities, ownership, review decisions, discussions, and personal viewed progress. An absent API origin displays configuration guidance rather than seeded demo accounts. Fixture data remains isolated in regression tests.

## Consistent UI state

- My Claims displays the number of retained claims belonging to the signed-in reviewer, including completed outcomes, matching the My Claims list.
- Successful transitions merge the returned version immediately. Refresh failure cannot undo a confirmed claim or hide its count.
- Older admission responses cannot replace a newer edit version. Refreshes coalesce; responses invalidated by a concurrent write are discarded.
- Account names refresh from `/auth/me`; changing accounts rejects responses from the previous session.
- Viewed progress uses versioned database preferences. It changes reading progress only, never edit ownership or review status.
- Reviews retain their frame while content loads and while saving. API activity uses one shared indicator. Following the feed still waits while the user interacts with rows.
- Audit browsing includes the latest 1,000 records. UI exports fetch selected records only. The paginated audit API and bounded export endpoint remain available for older history.

## Default server limits

Settings use the `WIKIWATCH_` prefix. Raising a setting increases resource requirements; it does not increase hosting storage or RAM.

| Setting | Default | Behavior at capacity |
| --- | ---: | --- |
| QUEUE_CAPACITY | 10,000 | Reject new active edits |
| EDIT_CAPACITY | 20,000 | Reject new edits, including when earlier edits were archived |
| AUDIT_CAPACITY | 100,000 | Reject changes that require additional audit or synchronization history; roll back the business change |
| MEMBER_CAPACITY | 1,000 | Reject new members |
| THREAD_CAPACITY | 20,000 | Reject new threads, including soft-deleted retained rows |
| COMMENT_CAPACITY | 100,000 | Reject additional comments |
| THREADS_PER_EDIT | 20 | Reject additional threads for one edit |
| COMMENTS_PER_THREAD | 20 | Reject additional comments, including the opening comment |
| SESSIONS_PER_MEMBER | 10 | Reject additional active sign-ins; discard expired/revoked sessions before issuing replacements |
| REQUEST_BYTES | 1 MiB | Return 413 before JSON parsing; applies to chunked uploads too |
| CONCURRENT_REQUESTS | 16 | Return 503 with Retry-After instead of accepting more application requests |

One worker serializes mutations, including password hashing, to avoid SQLite write races and concurrent password-hashing memory allocation. PostgreSQL also locks the workspace for business mutations and the member for session issuance; compare-and-set versions remain necessary for stale clients. SQLite multi-worker deployment is not supported. Authentication rate limiting is per worker; horizontal scaling requires a shared limiter.

The PostgreSQL connection pool is capped at five connections with no overflow, a 10-second pool/lock timeout, and a 15-second statement timeout. Startup sets one worker, a connection-concurrency limit, a bounded backlog, and a short idle keep-alive. Discussion responses contain at most five threads per page and twenty comments per thread. Oversized retained discussions fail visibly rather than silently returning incomplete history. Reporting aggregates counts in SQL instead of loading every edit object into Python.

## Browser limits

Review batches accept at most 20 selected edits. The live stream buffer keeps at most 500 edits between flushes, and the admission buffer keeps at most 100 candidates. The live feed keeps 200 additional unsaved edits alongside retained database edits and the active review. Stream observation detail keeps 10,000 page buckets; additional observations aggregate by minute/wiki so totals remain intact while page-level detail is reduced. Disk cache saves at most 500 metadata records after a debounce and excludes article text and audit history. Full revision text is retained for a bounded number of reviews. Interactive reviews reject pairs over 300,000 characters or 12,000 lines; diff computation has a time budget.

## Validation and deployment

Regression tests cover claim conflicts, competing admissions for the last slot, rollback at history capacity, archived-edit storage limits, thread/comment limits, one-use refresh tokens, oversized uploads, current identity, confirmed sidebar counts after refresh failure, and stale admission responses. Tests run against an isolated SQLite database and a disposable PostgreSQL database, never the team database.

Rebuild the frontend and restart/rebuild the API to apply these changes. No schema migration is required for the safeguards.

These bounds stop unchecked application row growth and reject excess work; they do not guarantee a particular physical database size or peak RAM. Indexes, write-ahead logs, backups, existing oversized data, and hosting processes also consume space and memory. Keep hosting quotas/monitoring and a reviewed history export/retention procedure. No team history is automatically deleted by this change. Sustained-load and multi-instance testing remain necessary before increasing traffic or worker count.

## Measured follow-up

See [System theme and measured load results](LOAD-TEST-RESULTS.md) for the 10-minute backend/frontend runs, claim/capacity races, controlled overload responses, and the measured concurrent-export OOM failure fixed with 100-record streaming batches. Both Follow live timing runs are retained, including the initial failed budget.
