# API operations

All paths below use the prefix `/wikiwatch-service/v1`.
Swagger shows each request, response, enum and validation rule.
Use `POST /auth/login`, copy `data.access_token`, and select **Authorize** in Swagger.
Log in again to test another role. A role cannot be selected in a request body.

JSON success responses have `{ "success": true, "data": ... }`.
Application errors have `{ "error": "..." }`.
Invalid request schemas use FastAPI's `422` validation response.
Lists use `items`, `total`, `offset` and `limit`. Maximum page size is 100.
CSV export is a file response.

## Operations by role

| Role | System operation | Method and path |
| --- | --- | --- |
| All accounts | Log in | POST `/auth/login` |
| All accounts | Refresh a session | POST `/auth/refresh` |
| All accounts | Log out | POST `/auth/logout` |
| All accounts | Read own account | GET `/auth/me` |
| All accounts | Read admitted edits with filters | GET `/edits` |
| All accounts | Read an edit and its review version | GET `/edits/{edit_id}` |
| All accounts | Read author and owner display names | GET `/members/directory` |
| All accounts | Catch up on shared changes | GET `/events?after={cursor}` |
| All accounts | Read or save personal board/viewed preferences | GET / PUT `/preferences/me` |
| Reviewer or lead | Admit selected stream edits to the team queue | POST `/edits/admit` |
| Reviewer | Claim, release, mark OK or flag | POST `/edits/{edit_id}/transition` |
| Reviewer or lead | Read page comment threads | GET `/edits/{edit_id}/threads` |
| Reviewer or lead | Start a line comment | POST `/edits/{edit_id}/threads` |
| Reviewer or lead | Reply to an open thread | POST `/threads/{thread_id}/comments` |
| Reviewer or lead | Resolve or reopen a thread | PATCH `/threads/{thread_id}` |
| Thread author | Delete a thread and hide its replies | DELETE `/threads/{thread_id}` |
| Lead | Read board column counts | GET `/board` |
| Lead | Load a board column's entries | GET `/edits?status={status}` |
| Lead | Read reviewer workload | GET `/workload` |
| Lead | Assign, return, verify, release or reopen | POST `/edits/{edit_id}/transition` |
| Lead or admin | List member accounts | GET `/members` |
| Admin | Create a member with an initial password | POST `/members` |
| Admin | Change a member role or active status | PATCH `/members/{member_id}` |
| Admin | Search audit records | GET `/audit` |
| Admin | Export audit records | GET `/audit/export` |
| Admin | Read activity chart data | GET `/activity?minutes=60` |
| Admin | Archive unclaimed or completed edits | POST `/edits/{edit_id}/archive` |
| Public | Check API and database readiness | GET `/health` |

Reviewer **My Claims** uses `GET /edits?owner_id={current_account_id}`.
The API returns the state even when the UI does not show a State column.
The reviewed board column combines `ok` and `verified_flagged`: fetch both status sets.
Title search uses `q`. Queue filters also include wiki, namespace, bot, minimum/maximum byte delta and archived status.
Audit search supports `q` on action/target, exact action and actor ID.

## Shared queue

Unclaimed means a non-archived database edit with status `unclaimed`.
It does not mean every edit observed by Wikimedia or this browser.
Admit a bounded, filtered feed batch. For example, restrict the training queue to one language and namespace.
Use one designated ingestion tab per class where possible. Other clients can submit the same revisions safely.
Duplicate `(wiki, new_rev)` entries return the existing record without overwriting it.
Admission returns database UUIDs. Use those IDs for claims and comments.

Admission trusts authenticated client-supplied metadata. It does not check Wikimedia source records.
Fetch source content from the public revision API and show an error if a revision is unavailable or hidden.
The active queue defaults to 10,000 edits. Admission fails with 409 when it is full.
Admin archive removes entries from active views. It does not delete their database history or free database storage.

## Real statuses

| Current state | Operation | Who | Next state |
| --- | --- | --- | --- |
| unclaimed | claim | Reviewer | claimed, owned by caller |
| unclaimed | assign | Lead | claimed, owned by chosen active reviewer |
| claimed / returned | ok | Claim owner | ok |
| claimed / returned | flag, with reason | Claim owner | flagged |
| claimed / returned | release | Claim owner | unclaimed |
| claimed | release | Lead | unclaimed |
| claimed / returned | assign | Lead | Same state, new owner |
| flagged | return, with feedback | Lead | returned |
| flagged | verify | Lead | verified_flagged |
| ok / verified_flagged | reopen, with feedback | Lead | returned |

`flagged` means waiting for verification. `returned` means another reviewer decision is needed.
`ok` and `verified_flagged` are completed reviews.
A lead must inspect the diff before verification in the UI. The backend cannot prove that a person has read it.
Assignment preserves returned feedback. Completed or flagged reviews cannot be reassigned.
Column drag changes presentation order. A card drag calls the relevant transition; an invalid move must show the API error.

Every transition needs `version` from the latest edit read.
For example:

```json
{ "operation": "flag", "version": 2, "reason": "The edit removes sourced text." }
```

A successful write increments the version. Simultaneous claims allow only one winner.
A stale version returns 409. Refetch the record and show the new owner/state.
Do not replay a failed claim as a silent success. Multi-select review uses one transition per edit and reports individual conflicts.
Each shared mutation commits its database change, audit record and change event together.

## Comments and anchors

A thread belongs to one page revision pair. A selected batch contains multiple independent page edits.
Store side, line range, UTF-16 offsets within each line, plain-text quote and optional source hash/prefix/suffix.
Offsets are zero-based. Line numbers are one-based.
A line comment can have an empty quote. A selection cannot include two revision sides.
No DOM nodes or HTML markup are required to save the location.

```json
{
  "anchor": {
    "wiki": "enwiki", "old_rev": 10, "new_rev": 20,
    "side": "new", "start_line": 4, "end_line": 4,
    "start_offset": 11, "end_offset": 16,
    "quote": "Ahmed", "source_hash": "frontend-text-hash"
  },
  "body": "Please check this name."
}
```

The revision IDs above are example values, not a validated Wikipedia edit.
The API checks the pair against its edit record. It does not fetch source text to verify line offsets.
The frontend must check the quote/hash against the loaded revision and show a stale anchor when they differ.
Render comment bodies and quotes as text. A string such as `<b>Ahmed</b>` stays a literal string; do not pass it to an HTML renderer.
Reviewer and lead can comment before claiming an edit. Archived edits are read only.
Reply to an open thread; reopen a resolved thread first.
Resolution and deletion need the thread version. A reply also increments the thread version.
Only the thread author can delete the thread. This hides its replies; retained rows remain in the database.

## Session and permission rules

Passwords use Argon2. Tokens are random bearer secrets; only hashes are stored.
Access lasts 15 minutes. Refresh lasts seven days. Refresh rotates both tokens and invalidates the previous session.
Logout revokes the current session. Disabled accounts are denied immediately.
Authorization reads the current database role on each request.
Keep tokens out of URLs, logs and service-worker caches. The example client keeps them in memory.
Serialize refresh calls. If refresh fails, show login and preserve unsent text locally.
There is a single-process login/refresh rate limit: 20 requests per IP per minute.
It resets on restart. A larger deployment needs a shared limiter and a reviewed authentication design.

Admin cannot remove their own admin access.
Reviewer access cannot be removed while that reviewer owns unfinished claims.

## Team synchronization and charts

Poll `/events` every few seconds while a relevant tab is visible.
Use the returned `next_cursor`. Drain `has_more` pages immediately, then resume the normal polling interval.
Events contain IDs and resource kinds. Refetch the resources the role can access.
PostgreSQL shared writes use a workspace lock so event IDs commit in cursor order.
This simple design targets a small training team. It does not target a high-volume global service.
SQLite uses uniqueness and compare-and-swap checks; PostgreSQL is the deployment database.

Activity reports admitted queue edits, including archived entries, grouped by UTC minute and wiki.
It returns counts, absolute byte changes, current status counts and top pages.
It does not report the global Wikimedia volume, browser-observed volume or a true Wikipedia revert rate.
Fill missing minute bins with zero, and label the scope clearly in Recharts.
Local live-feed rate and overload statistics remain frontend measurements.

## Public Wikimedia calls

These remain frontend calls. They are not implemented by WikiWatch.

| Operation | API | Documentation |
| --- | --- | --- |
| Receive live changes | EventStreams `recentchange` SSE | [EventStreams](https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams) |
| Load fixed source revisions for the GitHub-style diff | Action API `action=query&prop=revisions&revids=OLD%7CNEW&rvprop=ids%7Ccontent&rvslots=main&format=json&formatversion=2&origin=*` | [Revisions](https://www.mediawiki.org/wiki/API:Revisions) |
| Optional server-produced diff HTML | Action API `action=compare&fromrev=OLD&torev=NEW&format=json&origin=*` | [Compare](https://www.mediawiki.org/wiki/API:Compare) |
| Backfill a missed wiki feed range | Action API `action=query&list=recentchanges` with time bounds and continuation | [RecentChanges](https://www.mediawiki.org/wiki/API:RecentChanges) |
| Anonymous browser access | Action API `origin=*`, without credentials | [Cross-site requests](https://www.mediawiki.org/wiki/API:Cross-site_requests) |

Use the wiki's actual hostname, not a hostname made by appending `.wikipedia.org` to a database key such as `enwiki`.
For a new page, `old_rev=0` means empty old content; do not request revision zero.
Hidden/deleted content and non-text revision models need a clear unavailable/unsupported state.
For this mock's custom diff and comment anchors, use source revisions and render the diff in the frontend.
Wikimedia does not store WikiWatch's team claims, member accounts or audit trail.
