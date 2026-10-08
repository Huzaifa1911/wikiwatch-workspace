# Free deployment

Recommended training setup:

| Part | Host | Reason |
| --- | --- | --- |
| Existing PWA frontend | GitHub Pages | Keep the current static deployment |
| Docker API and Swagger | Render Free web service | Runs FastAPI over HTTPS |
| Persistent database | Neon Free PostgreSQL | Data stays separate from Render's temporary disk |

Free-plan details were checked on 8 October 2026 against the providers' official documentation.
Render free services sleep after 15 minutes without inbound traffic. A cold start takes about a minute.
The workspace gets 750 free instance hours each month. Bandwidth/build allowances also apply.
Render may suspend a free service that generates unusually high outbound traffic, including database traffic.
This is suitable for a small training class, not an always-available production service.

Neon Free currently includes 100 CU-hours of compute and 1 GB of PostgreSQL storage per project.
Its published free-plan limits include 5 GB of public network transfer per project per month.
There is also a 20 GB combined storage allowance across free projects.
Monitor the dashboard. Quotas and free-plan terms can change.

Do not deploy SQLite on Render Free: local files are lost on restart, redeploy or idle shutdown.
Render's own free PostgreSQL expires after 30 days, so it is a poor fit for a longer course.
Avoid keep-alive pings. Let the API sleep when the class is inactive.
Stop browser polling in hidden tabs and use backoff after failures.

## Deploy

1. Create a Neon project on the Free plan. Choose a region near the Render service.
2. Copy its direct PostgreSQL connection string. Keep `sslmode=require` enabled.
3. Upload the entire parent `wikiwatch-workspace` as one GitHub repository. Use the single `render.yaml` at the workspace/repository root; it points to `wikiwatch-backend/services/wikiwatch-service`.
4. Run the included PostgreSQL GitHub Actions checks. Use a disposable CI database only.
5. In Render, create a Blueprint from that repository. Confirm the service plan is **Free**.
6. Enter these environment values when Render asks for them:

| Variable | Value |
| --- | --- |
| `WIKIWATCH_DATABASE_URL` | Neon connection string; keep this secret |
| `WIKIWATCH_CORS_ALLOW_ORIGINS` | `["https://YOUR-ACCOUNT.github.io"]` |
| `WIKIWATCH_BOOTSTRAP_EMAIL` | Your chosen admin email |
| `WIKIWATCH_BOOTSTRAP_PASSWORD` | Your own password, at least 12 characters |
| `WIKIWATCH_SEED_ON_DEPLOY` | `true` for the first deployment |
| `WIKIWATCH_SEED_DEMO` | `false`; use `true` only if you want the four training accounts |

CORS takes an origin, not a repository path. For example, use `https://name.github.io`, not `https://name.github.io/wikiwatch/`.
Add the exact custom-domain origin if you use one. Do not use `*`.
Never put the database URL or bootstrap password in HTML, GitHub Pages, Git, or a service worker.

The start script applies migrations, runs explicitly enabled bootstrap, then starts one API worker.
The bootstrap is idempotent for existing emails.
After the first successful deployment, set `WIKIWATCH_SEED_ON_DEPLOY=false` and remove the bootstrap password from Render's environment.
Use the member API to add further accounts.

7. Open `https://YOUR-SERVICE.onrender.com/wikiwatch-service/v1/health`.
8. Open `https://YOUR-SERVICE.onrender.com/wikiwatch-service/v1/swagger`.
9. Test login, a claim, a flag, a lead return, a comment thread and audit export.
10. Restart/redeploy the API and confirm the same records remain in Neon.
11. Set the frontend repository variable `WIKIWATCH_API_HOST` to `https://YOUR-SERVICE.onrender.com` (origin only). The existing adapter adds `/wikiwatch-service/v1`. Rebuild and deploy the frontend.

The backend has not been deployed to an account in this delivery. No repository or account credentials were supplied.
The frontend adapter is already implemented; its API host must be set at build time.

## Instructor maintenance

- Back up the database before a course reset or migration.
- Use the active queue cap. Do not admit the complete Wikimedia firehose.
- Archive eligible entries to keep the board small. Archive does not reduce stored data.
- Review database, audit, thread, event and expired-session retention between cohorts.
- Keep one API worker for the delivered in-memory authentication rate limiter.
- PostgreSQL serializes shared writes through one workspace lock. This favors correctness over write throughput.
- CORS and route guards are not substitutes for the API's role checks.
- The audit is append-only through the application API, not a tamper-proof compliance archive.

## Official sources

- [Render Free limits](https://render.com/docs/free)
- [Render Blueprint format](https://render.com/docs/blueprint-spec)
- [Neon pricing](https://neon.com/pricing)
- [Neon free-plan quotas](https://neon.com/docs/introduction/plans)
- [Neon's October 2026 storage update](https://neon.com/blog/neon-free-plan-1-gb-per-project)
