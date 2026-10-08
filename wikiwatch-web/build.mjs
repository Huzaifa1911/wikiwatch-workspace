import { createHash } from "node:crypto";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// Only the public API origin is included in the HTML. Never inline all env values.
let apiHost = process.env.WIKIWATCH_API_HOST;
if (apiHost === undefined) {
  try {
    const line = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((line) => /^\s*WIKIWATCH_API_HOST\s*=/.test(line));
    apiHost =
      line
        ?.slice(line.indexOf("=") + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "") || "";
  } catch {
    apiHost = "";
  }
}
apiHost = apiHost.replace(/\/$/, "");
if (apiHost) {
  const url = new URL(apiHost);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "WIKIWATCH_API_HOST must be an HTTP(S) origin, without an API path or credentials.",
    );
}
mkdirSync("dist", { recursive: true });
execFileSync(
  "node",
  [
    "node_modules/tailwindcss/lib/cli.js",
    "-i",
    "src/styles.css",
    "-o",
    "dist/style.css",
    "--minify",
  ],
  { stdio: "inherit" },
);
await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  minify: true,
  outfile: "dist/app.js",
  define: {
    "process.env.NODE_ENV": '"production"',
    __API_HOST__: JSON.stringify(apiHost),
  },
  target: "es2020",
});
const icons = JSON.parse(readFileSync("src/pwa-icons.json", "utf8"));
const pwa = `<meta name="theme-color" content="#17664f"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="WikiWatch"><link rel="icon" href="${icons[0].src}"><link rel="apple-touch-icon" href="${icons[0].src}"><script>(()=>{const url=new URL(location.href);url.hash='';url.search='';const manifest={id:url.href,name:'WikiWatch',short_name:'WikiWatch',description:'A live Wikipedia review workspace',start_url:url.href+'#/login',scope:new URL('.',url).href,display:'standalone',background_color:'#fcfcfc',theme_color:'#17664f',icons:${JSON.stringify(icons)}};const link=document.createElement('link');link.rel='manifest';link.href='data:application/manifest+json,'+encodeURIComponent(JSON.stringify(manifest));document.head.append(link)})();</script>`;
const registration = `<script>if('serviceWorker' in navigator&&isSecureContext&&location.protocol!=='file:'){addEventListener('load',()=>{navigator.serviceWorker.register(new URL('./sw.js',location.href),{scope:'./',updateViaCache:'none'}).then(()=>{window.wikiwatchOfflineReady=navigator.serviceWorker.ready}).catch(error=>{console.warn('WikiWatch offline cache is unavailable:',error.message)})})}</script>`;
const css = readFileSync("dist/style.css", "utf8"),
  js = readFileSync("dist/app.js", "utf8").replaceAll("</script", "<\\/script");
writeFileSync(
  "dist/Patrol-Desk.html",
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="WikiWatch — interactive frontend assignment mocks for reviewers, team leads and admins."><title>WikiWatch</title>${pwa}<style>${css}</style></head><body><div id="root"></div><script>${js}</script>${registration}</body></html>`,
);

const html = readFileSync("dist/Patrol-Desk.html", "utf8");
writeFileSync("dist/index.html", html);
const version = createHash("sha256").update(html).digest("hex").slice(0, 16);
writeFileSync(
  "dist/sw.js",
  readFileSync("src/sw.template.js", "utf8").replace(
    "__BUILD_VERSION__",
    version,
  ),
);
writeFileSync("dist/.nojekyll", "");
