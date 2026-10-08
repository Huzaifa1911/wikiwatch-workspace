import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const backendDir = resolve("../wikiwatch-backend/services/wikiwatch-service");
const python = process.env.WIKIWATCH_PYTHON || backendDir + "/.venv/bin/python";
const fixture = mkdtempSync(tmpdir() + "/wikiwatch-api-");
const env = {
  ...process.env,
  WIKIWATCH_DATABASE_URL: `sqlite+aiosqlite:///${fixture}/test.db`,
  WIKIWATCH_CORS_ALLOW_ORIGINS: '["http://127.0.0.1:4173"]',
  WIKIWATCH_BOOTSTRAP_PASSWORD: "integration-password-123",
  WIKIWATCH_SEED_DEMO: "true",
};
for (const args of [
  [python, "-m", "alembic", "upgrade", "head"],
  [python, "-m", "app.seed"],
]) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: backendDir,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
let server = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8012"],
  { cwd: backendDir, env, stdio: "ignore" },
);
const html = readFileSync("dist/index.html");
const website = createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url?.includes("sw.js") ? "application/javascript" : "text/html",
  );
  res.end(req.url?.includes("sw.js") ? readFileSync("dist/sw.js") : html);
}).listen(4173, "127.0.0.1");
let browser;
const base = "http://127.0.0.1:8012/wikiwatch-service/v1";
async function ready() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("API did not start");
}
async function publicFixtures(context) {
  await context.route("https://stream.wikimedia.org/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: message\ndata: {}\n\n",
    }),
  );
  await context.route("https://*.wikipedia.org/w/api.php**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("list") === "recentchanges")
      return route.fulfill({
        json: {
          query: {
            recentchanges:
              url.hostname === "en.wikipedia.org"
                ? [
                    {
                      type: "edit",
                      ns: 0,
                      title: "Mars",
                      user: "WikiEditor",
                      comment: "Corrected a name",
                      oldlen: 40,
                      newlen: 46,
                      old_revid: 10,
                      revid: 20,
                      pageid: 42,
                      timestamp: new Date().toISOString(),
                    },
                  ]
                : [],
          },
        },
      });
    if (url.searchParams.get("prop") === "revisions")
      return route.fulfill({
        json: {
          query: {
            pages: [
              {
                pageid: 42,
                revisions: [
                  {
                    revid: 10,
                    slots: {
                      main: {
                        content: "Heading\nThe name is Ali.\nReferences.",
                        contentmodel: "wikitext",
                      },
                    },
                  },
                  {
                    revid: 20,
                    slots: {
                      main: {
                        content: "Heading\nThe name is Ahmed.\nReferences.",
                        contentmodel: "wikitext",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      });
    return route.fulfill({ json: { compare: { fromrevid: 10, torevid: 20 } } });
  });
}
async function login(user) {
  const context = await browser.newContext();
  await publicFixtures(context);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/");
  await page.getByLabel("Email", { exact: true }).fill(user + "@example.org");
  await page
    .getByLabel("Password", { exact: true })
    .fill("integration-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.getByText("Connected", { exact: true }).first().waitFor();
  return { context, page };
}
const checks = [];
try {
  await ready();
  browser = await chromium.launch({
    ...(process.env.WIKIWATCH_CHROMIUM ? { executablePath: process.env.WIKIWATCH_CHROMIUM } : { channel: "chrome" }),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  const reviewer = await login("dev");
  const errors = [];
  reviewer.page.on("pageerror", (e) => errors.push(e.message));
  await reviewer.page
    .getByRole("button", { name: "Inspect Mars", exact: true })
    .click();
  await reviewer.page
    .getByRole("button", { name: "Claim edit", exact: true })
    .click();
  await reviewer.page
    .getByRole("button", { name: "Mark OK", exact: true })
    .waitFor();
  checks.push("Real login, admission, source diff and claim");
  await reviewer.page
    .getByRole("button", { name: "Comment on new line 2", exact: true })
    .click();
  await reviewer.page
    .getByLabel("Comment", { exact: true })
    .fill("Check this name against the source.");
  await reviewer.page
    .getByRole("button", { name: "Save comment", exact: true })
    .click();
  await reviewer.page
    .getByText("Check this name against the source.", { exact: true })
    .first()
    .waitFor();
  await reviewer.page.evaluate(() => {
    const key = "wikiwatch-api-session-v1";
    const session = JSON.parse(sessionStorage.getItem(key));
    session.access_token = "expired-test-token";
    sessionStorage.setItem(key, JSON.stringify(session));
  });
  await reviewer.page.reload();
  await reviewer.page.getByText("Changes to review", { exact: true }).waitFor();
  await reviewer.page
    .getByRole("button", { name: "Expand thread on new line 2" })
    .click();
  await reviewer.page
    .getByText("Check this name against the source.", { exact: true })
    .first()
    .waitFor();
  checks.push("Token refresh and persisted comments after reload");
  await reviewer.page
    .getByRole("button", { name: "Reply", exact: true })
    .click();
  await reviewer.page.getByLabel("Reply text").fill("Reviewed the citation.");
  await reviewer.page
    .getByRole("button", { name: "Save reply", exact: true })
    .click();
  await reviewer.page
    .getByText("Reviewed the citation.", { exact: true })
    .waitFor();
  await reviewer.page
    .getByRole("button", { name: "Resolve", exact: true })
    .click();
  await reviewer.page
    .getByRole("button", { name: "Reopen", exact: true })
    .waitFor();
  await reviewer.page
    .getByRole("button", { name: "Reopen", exact: true })
    .click();
  checks.push("Reply, resolve and reopen use real thread versions");
  await reviewer.page
    .getByLabel("Why should this edit be flagged?")
    .fill("Name needs a reliable source.");
  await reviewer.page
    .getByRole("button", { name: "Raise flag", exact: true })
    .click();
  await reviewer.page
    .getByText("Flag reason: Name needs a reliable source.", { exact: true })
    .waitFor();
  const lead = await login("sara");
  await lead.page
    .getByRole("button", { name: "Inspect review", exact: true })
    .click();
  await lead.page
    .getByRole("button", { name: "Verify flag", exact: true })
    .waitFor();
  await lead.page
    .getByLabel("Why must the reviewer review it again?")
    .fill("Explain which citation is missing.");
  await lead.page
    .getByRole("button", { name: "Return for review", exact: true })
    .click();
  await lead.page
    .getByText("Lead feedback: Explain which citation is missing.", {
      exact: true,
    })
    .waitFor();
  await reviewer.page
    .getByRole("button", { name: "Resubmit flag", exact: true })
    .waitFor({ timeout: 15000 });
  await reviewer.page
    .getByRole("button", { name: "Mark OK", exact: true })
    .click();
  checks.push(
    "Lead return and second reviewer decision synchronize across accounts",
  );
  await reviewer.page.goto(
    "http://127.0.0.1:4173/#/admin/members?role=admin&user=noor",
  );
  await reviewer.page
    .getByRole("heading", { name: "Live feed", exact: true })
    .waitFor();
  checks.push("Cross-role URL is denied");
  const admin = await login("noor");
  await admin.page
    .getByRole("heading", { name: "Edit Activity", exact: true })
    .waitFor();
  assert.equal(
    await admin.page.getByText("Admitted edits", { exact: true }).count(),
    1,
  );
  await admin.page
    .getByRole("button", { name: "Members", exact: true })
    .click();
  await admin.page
    .getByRole("button", { name: "Add member", exact: true })
    .click();
  await admin.page.getByLabel("Full name").fill("New Reviewer");
  await admin.page.getByLabel("Email address").fill("new@example.org");
  await admin.page.getByLabel("Initial password").fill("new-password-123");
  await admin.page
    .getByRole("button", { name: "Create member", exact: true })
    .click();
  await admin.page.getByText("New Reviewer", { exact: true }).waitFor();
  checks.push("Admin creates a real member with an initial password");
  await admin.page
    .getByRole("button", { name: "Audit Log", exact: true })
    .click();
  const download = admin.page.waitForEvent("download");
  await admin.page
    .getByRole("button", { name: "Export CSV", exact: true })
    .click();
  const file = await download;
  assert.equal(file.suggestedFilename(), "wikiwatch-audit.csv");
  checks.push("Admin charts, audit records and backend CSV export");
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await admin.page.setViewportSize({ width, height });
    await admin.page.waitForTimeout(150);
    const bounds = await admin.page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }));
    assert.ok(bounds.width <= bounds.viewportWidth + 1, JSON.stringify(bounds));
    assert.ok(
      bounds.height <= bounds.viewportHeight + 1,
      JSON.stringify(bounds),
    );
    if (width === 390) {
      await admin.page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await admin.page
        .getByRole("dialog")
        .getByRole("button", { name: "Edit Activity", exact: true })
        .click();
      await admin.page
        .getByRole("heading", { name: "Edit Activity", exact: true })
        .waitFor();
    }
  }
  checks.push("Connected layout and navigation fit phone, tablet and desktop");
  const apiTokens = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "dev@example.org",
      password: "integration-password-123",
    }),
  }).then((r) => r.json());
  const apiHeaders = { Authorization: "Bearer " + apiTokens.data.access_token };
  const edit = await fetch(base + "/edits", { headers: apiHeaders }).then((r) =>
    r.json(),
  );
  assert.equal(edit.data.items[0].status, "ok");
  const threads = await fetch(
    base + `/edits/${edit.data.items[0].id}/threads`,
    { headers: apiHeaders },
  ).then((r) => r.json());
  assert.equal(threads.data.items[0].comments.length, 2);
  await reviewer.page
    .getByRole("button", { name: "My Claims", exact: true })
    .click();
  await reviewer.page
    .getByRole("button", { name: "View diff for Mars", exact: true })
    .click();
  await reviewer.page
    .getByText("New revision · + starts a thread", { exact: true })
    .waitFor();
  await reviewer.page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await reviewer.context.setOffline(true);
  await reviewer.page.reload();
  await reviewer.page
    .getByText("New revision · + starts a thread", { exact: true })
    .waitFor();
  await reviewer.page
    .getByRole("button", { name: "Expand thread on new line 2" })
    .click();
  await reviewer.page
    .getByText("Check this name against the source.", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await reviewer.page
      .getByRole("button", { name: "Resolve", exact: true })
      .isDisabled(),
    true,
  );
  await reviewer.context.setOffline(false);
  checks.push(
    "PWA reload retains cached diff and threads with offline writes blocked",
  );
  server.kill();
  await new Promise((r) => server.once("exit", r));
  server = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8012"],
    { cwd: backendDir, env, stdio: "ignore" },
  );
  await ready();
  assert.equal(
    (
      await fetch(base + "/edits", { headers: apiHeaders }).then((r) =>
        r.json(),
      )
    ).data.items[0].status,
    "ok",
  );
  checks.push("API restart preserves review and session in database");
  await reviewer.page.evaluate(() => {
    const key = 'wikiwatch-api-session-v1';
    const session = JSON.parse(sessionStorage.getItem(key));
    session.access_token = 'invalid-access';
    session.refresh_token = 'invalid-refresh';
    sessionStorage.setItem(key, JSON.stringify(session));
  });
  await reviewer.page.reload();
  await reviewer.page.getByRole('button', {name: 'Sign in', exact: true}).waitFor();
  checks.push('Invalid refresh credentials return to login');
  assert.deepEqual(errors, []);
  writeFileSync(
    "api-test-results.json",
    JSON.stringify(
      {
        checks,
        runtimeErrors: errors,
        database: "SQLite",
        wikimedia: "deterministic source fixtures; backend APIs are real",
      },
      null,
      2,
    ),
  );
  console.log(checks.join("\n"));
} finally {
  if (browser) await browser.close();
  website.close();
  server.kill();
}
