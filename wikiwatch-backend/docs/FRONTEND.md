# Connect the frontend

This backend replaces the browser mock store. It does not replace the public Wikimedia APIs.
The original HTML has not been changed in this delivery.

Use the included `examples/api-client.js` as a starting point.
It keeps tokens in memory, serializes refresh calls and unwraps the success envelope.
Reloading the page requires login again. Choose a different session persistence policy only after reviewing its security trade-offs.

## Replace these mock operations

| Current frontend behavior | API replacement |
| --- | --- |
| Dummy email login and role switching | `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout` |
| Browser member list | `/members` for admin/lead; `/members/directory` for display names |
| Store incoming edits locally | Keep a capped live buffer; admit selected filtered batches with `/edits/admit` |
| Infer the unclaimed team board from the live buffer | Read `/board` and `/edits?status=unclaimed` |
| Claim/review store reducer | `/edits/{id}/transition` with the current version |
| My Claims | `/edits?owner_id={me.id}`; do not add a State column if the design omits it |
| Lead board/workload | `/board`, `/edits`, `/workload` |
| Local comment storage | `/edits/{id}/threads`, `/threads/{id}/comments`, thread resolve/delete |
| Local admin member changes | POST / PATCH `/members` |
| Browser audit array and CSV export | `/audit`, `/audit/export` |
| Admin activity sample data | `/activity`, clearly labelled admitted queue activity |
| Local board/viewed preferences | GET / PUT `/preferences/me` |
| Cross-tab simulated state | `/events` cursor polling, followed by resource refetch |

Backend role `reviewer` maps to the old frontend enum `patroller` during migration.
Do not expose the old name to users.
Backend edit `id` is a UUID, not the stream event ID. Keep `(wiki, new_rev)` as the admission/deduplication key.
Keep raw feed rows and admitted database rows separate, and map them by that key.
Backend field names use snake_case. The current frontend uses fields such as `oldRev` and `newRev`; map them explicitly.
The `edits` response holds the current claim state and owner; it replaces the mock `claims` array.

The mock selection anchors use absolute UTF-16 offsets and a revision fingerprint.
Convert them to source-side line numbers and offsets for this API. Preserve the plain-text quote and optional source hash/prefix/suffix.
Do not derive positions from virtualized DOM row indexes; derive them from the full immutable revision text.
Rendered row indexes change when split/unified mode, context or virtualization changes.

## Expected UI behavior

- Guard routes using `/auth/me`, and handle 403 from every mutation.
- Show pending state while a write is in progress. Confirm only after success.
- On 409, reload the affected record and show the owner or state that caused the conflict.
- Keep unsent comment text if the network fails. Let the user retry; do not silently submit duplicates.
- Bulk Review Selected uses separate edit writes. Show each result, including partial conflicts.
- Poll events only while useful. On reconnect, resume from the last cursor and drain remaining pages.
- Refetch board counts, visible tables and current review records after relevant events.
- Distinguish a filtered raw live feed from the authoritative shared board.
- Handle Render cold starts with a clear reconnect state and backoff.
- Render titles, usernames, reasons and comment bodies as text. Sanitize optional Wikimedia diff HTML.
- Fetch fixed source revisions directly from Wikimedia. Abort obsolete requests when selection changes.
- Use Recharts for returned activity bins and AG Grid for tables. Fill missing chart minutes with zero.
- Column drag saves view order. Card drag calls a valid transition and rolls back visually on failure.
- Keep the existing service worker's shell-only policy. Do not cache bearer tokens or authenticated API responses.

If a source revision is unavailable, show that state. Do not render an empty diff as proof of no changes.
An existing backend edit record does not guarantee that Wikimedia still exposes its source text.
