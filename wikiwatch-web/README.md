# WikiWatch

A responsive React and TypeScript frontend with shadcn/ui, AG Grid Community and Recharts. Team actions now call the supplied WikiWatch backend. Public Wikipedia data still comes directly from Wikimedia.

## Local development

From the parent workspace, start the API and PostgreSQL with `docker compose up --build -d --wait`. This frontend's `.env` points to `http://localhost:8000`. Run `npm ci` then `npm run dev` and open http://localhost:5173. Use the bootstrap email/password in the backend service `.env` to sign in. Restart the frontend command after changes to sources or env settings.

## Set the API host

Edit `.env` in this folder:

```dotenv
WIKIWATCH_API_HOST=https://your-api-host.onrender.com
```

Use the backend origin only. Do not include `/wikiwatch-service/v1`. This path is added by the client. The host is public configuration. Do not put passwords or private API keys in this frontend file.

```sh
npm ci
npm run typecheck
npm run build
```

The build reads `.env` and embeds this one host in the HTML. Rebuild after each host change. A process environment variable overrides `.env`. An empty host keeps the original local demo; its data does not migrate into the backend.

Serve `dist` over HTTP for local testing. Use the HTTPS GitHub Pages address when deployed. Opening the file directly does not provide a working service worker.

## Deploy on GitHub Pages

Upload the entire parent `wikiwatch-workspace` as one GitHub repository, preserving both subfolders. Deployment workflows live in the workspace root `.github/workflows`.

For an Actions deployment:

1. Set the repository variable `WIKIWATCH_API_HOST` to the HTTPS backend origin under Settings → Secrets and variables → Actions → Variables. This value is public.
2. Set Settings → Pages → Source to GitHub Actions.
3. Push to `main`. The workspace root `.github/workflows/pages.yml` builds this frontend and publishes `wikiwatch-web/dist`.

Actions cannot read your local `.env`, so the repository variable supplies the same setting there. The workflow rejects an empty host.

For a manual build, upload `dist/index.html`, `dist/sw.js` and `dist/.nojekyll` together to your Pages publishing folder. Keep the HTML and worker in the same folder. Root sites and repository paths are supported.

Set this variable on the **backend**, then restart it:

```dotenv
WIKIWATCH_CORS_ALLOW_ORIGINS=["https://YOUR_USERNAME.github.io"]
```

Use the Pages origin without the repository path. The backend must be available over HTTPS. Ensure its database has been migrated and accounts have been created. Use its seed/bootstrap instructions for the initial admin. There are no frontend demo credentials in connected mode.

GitHub Pages instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Connected behavior

| Area | Backend operations |
| --- | --- |
| Login | Login, account validation, refresh rotation and logout |
| Review | Admit selected Wikipedia edits, claim, release, mark OK and flag |
| Comments | Create threads, reply, resolve, reopen and author deletion |
| Team lead | Shared queue, claim board, assignments, return/verify and workload |
| Admin | Activity, members, role/access changes, audit search and CSV export |
| Personal settings | Viewed edits and board column order |
| Team updates | Durable event polling, then fetch authoritative data |

API paths start at `/wikiwatch-service/v1`. Dev mode shows the host, connection state and a link to Swagger. Changes are shown as successful only after the server confirms them. Version conflicts refresh the view and show a message.

Access and refresh tokens stay in sessionStorage for this tab. Requests serialize token refresh and retry once after a 401. Server permissions protect all role operations; changing the route or cached account does not grant access.

Team updates poll every five seconds while the page is visible. Failures use backoff up to one minute. Online and visibility changes trigger recovery. This uses the supplied event API, rather than a mocked WebSocket.

## Shared queue and charts

The live feed is a bounded reading view of Wikimedia events. It is distinct from the shared database queue. Selecting edits for review admits them into that queue. While a lead is online, their visible workspace also admits up to ten English article edits every 30 seconds. Duplicate revisions are deduplicated by the server. This policy is shown in Dev mode.

Unclaimed means admitted database edits with no owner. Board counts, workload and decisions come from the backend. Admin charts show activity in the admitted queue, including archived records. They do not claim to show all Wikipedia activity or a global revert rate. The frontend loads paginated team data up to 10,000 records and reports a limit error rather than silently truncating it. Larger deployments need server-driven grids.

## Diffs and comments

A review batch contains independent Wikipedia revision pairs, rather than a multi-file commit. The changed-pages tree groups wiki, page and revisions. Source revisions are fetched from Wikipedia, then rendered as escaped text in split or unified diff mode. Changes with context is enabled by default. Large diffs use measured virtualization.

Click the line comment control, or select source text and right-click to add a comment. Threads stay on their source line. Anchors contain the revision pair, side, line numbers, UTF-16 text offsets, quote, source fingerprint and context. The app does not save raw HTML or DOM nodes. API responses supply thread IDs and versions. Comments are shared across accounts and persist in the database.

Viewed status is personal progress. It does not mark the edit OK. Neither the frontend nor backend edits Wikipedia, patrols it, or performs a revert.

## Offline and PWA

The separate service worker caches the bundled app shell. Confirmed queue data, loaded source pairs and comment threads are cached per host/account in browser storage for read-only offline review. Tokens and API responses are not cached by the worker. Writes are blocked offline or when the API is unavailable; claims are not queued for replay. Unloaded diffs remain unavailable offline.

Open the hosted app once online before offline testing. Worker updates activate after older app tabs close. Cache versions include the build content and project scope. Offline access shows previously authorized cached data; the server checks authorization again when the connection returns.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

The original 35 behavior tests cover the local demo. `scripts/api-check.mjs` tests the connected browser against a temporary real SQLite backend: login, refresh, admission, diff loading, claims, comments, lead return, role guards, member creation, charts, audit export, responsive navigation, offline review and restart persistence. Wikimedia responses in this test are deterministic fixtures; the team backend is real.

For the integration test, place the supplied backend beside this folder as `../wikiwatch-backend`, install its `.venv` dependencies and install Playwright Chromium. Then run:

```sh
npm run test:api
```

Set `WIKIWATCH_CHROMIUM` if using an existing Chromium executable. This command builds with a test localhost host; run `npm run build` again with your deployment host before publishing. Results are in `api-test-results.json`.

Public API documentation: [EventStreams](https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams_HTTP_Service), [Revisions](https://www.mediawiki.org/wiki/API:Revisions), [RecentChanges](https://www.mediawiki.org/wiki/API:RecentChanges), [Compare](https://www.mediawiki.org/wiki/API:Compare), [CORS](https://www.mediawiki.org/wiki/API:Cross-site_requests).

The instructor supplies and operates the backend. Trainees consume it. This frontend is one bundle; independently deployed microfrontends remain assignment work. The supplied backend has local SQLite and hosted PostgreSQL modes. Hosted deployment, PostgreSQL execution, native-device installation and screen-reader QA are separate validation steps.
