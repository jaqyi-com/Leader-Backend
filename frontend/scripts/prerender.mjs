// Runs after `vite build` and `vite build --ssr`. Writes static HTML for the public pages so
// crawlers that do not run JavaScript still see the content and the right <head> tags:
//
//   dist/index.html          → "/" (pre-rendered landing page)
//   dist/pricing/index.html  → "/pricing"
//   dist/app-shell.html      → empty SPA shell, served by vercel.json for every other route.
//                              Marked noindex so login, app and unknown URLs stay out of search.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const { render } = await import(pathToFileURL(path.join(root, "dist-ssr", "entry-server.js")).href);
const { INDEXABLE_ROUTES, metaFor } = await import(pathToFileURL(path.join(root, "src", "seo.js")).href);

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const ROOT_DIV = '<div id="root"></div>';
if (!template.includes(ROOT_DIV)) throw new Error("dist/index.html has no empty #root to fill");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function setAttr(html, selector, attr, value) {
  // selector is e.g. ['meta', 'name', 'description']
  const [tag, key, keyValue] = selector;
  const re = new RegExp(`(<${tag}\\s[^>]*${key}="${keyValue}"[^>]*\\s${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`<${tag} ${key}="${keyValue}"> not found in template`);
  return html.replace(re, `$1${esc(value)}$2`);
}

function withHead(html, m) {
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`);
  html = setAttr(html, ["meta", "name", "description"], "content", m.description);
  html = setAttr(html, ["link", "rel", "canonical"], "href", m.canonical);
  html = setAttr(html, ["meta", "property", "og:url"], "content", m.canonical);
  html = setAttr(html, ["meta", "property", "og:title"], "content", m.title);
  html = setAttr(html, ["meta", "property", "og:description"], "content", m.description);
  html = setAttr(html, ["meta", "name", "twitter:title"], "content", m.title);
  html = setAttr(html, ["meta", "name", "robots"], "content",
    m.index ? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" : "noindex, follow");
  return html;
}

// SPA shell for every non-public route (written before index.html is overwritten).
fs.writeFileSync(path.join(dist, "app-shell.html"), withHead(template, metaFor("/app")));

for (const route of Object.keys(INDEXABLE_ROUTES)) {
  const body = render(route);
  const html = withHead(template, metaFor(route)).replace(ROOT_DIV, `<div id="root">${body}</div>`);
  const out = route === "/" ? path.join(dist, "index.html") : path.join(dist, route.slice(1), "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`[prerender] ${route} → ${path.relative(root, out)} (${Math.round(body.length / 1024)} KB of HTML)`);
}

fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
