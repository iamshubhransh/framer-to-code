// strip.mjs <FRAMER_URL> [OUT_DIR]
// The HARD build: turns the crawled download into a static site with the Framer
// runtime REMOVED — no React, no hydration, zero .mjs shipped. Keeps Framer's
// self-contained inline appear animator (when the publish has one), classifies every
// other script (keep/kill/audit), plans which SSR-hidden elements must be revealed
// from the hydrated-live census (snapshot.mjs), and injects a tiny appear shim +
// per-site reveal config. Repairs belong in /assets/js/site.js + /assets/css/site.css
// — strip.mjs never overwrites them, so it is safe to re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || '').replace(/\/+$/, '');
const OUT = path.resolve(process.argv[3] || 'site');
if (!BASE) { console.error('usage: node strip.mjs <framer-url> [out-dir]'); process.exit(1); }
const HOST = new URL(BASE).host;
const ORIGIN = 'https://' + HOST;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WORK = path.join(OUT, '_work');
const LIVE = path.join(WORK, 'live');
const manifest = JSON.parse(fs.readFileSync(path.join(WORK, 'manifest.json'), 'utf8'));
const pageList = JSON.parse(fs.readFileSync(path.join(WORK, 'pages.json'), 'utf8'));
// Pages are written at their REAL path (/blog/why-x -> blog/why-x.html), so nested
// routes work on any static host (the classic skill's flat slug files 404 there).
const routeOf = p => new URL(p.url).pathname.replace(/\/+$/, '') || '/';
const fileFor = p => { const r = routeOf(p); return r === '/' ? 'index.html' : r.replace(/^\//, '') + '.html'; };
const canon = u => u.split('#')[0].split('?')[0];
const basename = u => canon(u).split('/').pop();
const GOOGLE_CSS = '/assets/css/google-fonts.css';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Removes any stale Framer service worker + caches (returning visitors of the old site).
const SW_KILLER = `<script>(function(){try{if('serviceWorker'in navigator){var c=navigator.serviceWorker.controller;navigator.serviceWorker.getRegistrations().then(function(rs){var had=rs.length>0;rs.forEach(function(r){r.unregister()});if(self.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}if((had||c)&&!sessionStorage.getItem('__sw_cleared')){sessionStorage.setItem('__sw_cleared','1');location.reload()}}).catch(function(){})}}catch(e){}})();</script>`;

async function fetchBuf(u, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (i === tries - 1) throw e; await new Promise(s => setTimeout(s, 500 * (i + 1))); }
  }
}

// canonical external URL -> final root-relative path (same layout the SSR HTML uses;
// /sites/ bundles map to nothing — they are never shipped in hard mode)
function refFor(u) {
  const c = canon(u); let x; try { x = new URL(c); } catch { return null; }
  const n = basename(c); const e = (n.includes('.') ? n.split('.').pop() : '').toLowerCase();
  if (x.host === 'framerusercontent.com') {
    const p = x.pathname;
    if (p.startsWith('/images/')) return '/images/' + n;
    if (p.startsWith('/sites/')) return null;
    if (p.startsWith('/third-party-assets/')) return '/assets/fonts/' + n;
    if (p.startsWith('/assets/')) {
      if (['woff2', 'woff', 'ttf', 'otf', 'eot'].includes(e)) return '/assets/fonts/' + n;
      if (['mp4', 'webm', 'mov', 'm4v'].includes(e)) return '/videos/' + n;
      return '/media/' + n;
    }
    return '/media/' + n;
  }
  if (x.host === 'fonts.gstatic.com') return '/assets/fonts/google/' + n;
  if (x.host === 'app.framerstatic.com') return ['woff2', 'woff', 'ttf', 'otf', 'eot'].includes(e) ? '/assets/fonts/' + n : null;
  if (x.host === 'i.ytimg.com') return '/assets/yt/' + x.pathname.replace(/^\/vi(_webp)?\//, '');
  return null;
}
const refMap = [];
for (const u of Object.keys(manifest.assets)) { if (u.endsWith('/fontshare/') || u.endsWith('/s/')) continue; const r = refFor(u); if (r) refMap.push([u, r]); }
const sortRefs = () => refMap.sort((a, b) => b[0].length - a[0].length);
sortRefs();
const localize = t => { for (const [u, r] of refMap) if (t.includes(u)) t = t.split(u).join(r); return t; };

// ---- 1) relocate media dirs to root (SSR HTML + og tags reference these paths) ----
for (const [from, to] of [['assets/images', 'images'], ['assets/videos', 'videos'], ['assets/media', 'media']]) {
  const s = path.join(OUT, from), d = path.join(OUT, to);
  if (fs.existsSync(s)) { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) fs.renameSync(path.join(s, f), path.join(d, f)); fs.rmdirSync(s); }
}

// ---- 2) YouTube thumbnails (literal urls in pages) ----
const ytSet = new Set(); const YT = /https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[A-Za-z0-9_-]+\/[a-z]+\.(?:webp|jpg)/g;
for (const p of pageList) { const t = fs.readFileSync(path.join(WORK, 'pages', p.slug + '.html'), 'utf8'); for (const m of t.matchAll(YT)) ytSet.add(m[0]); }
fs.rmSync(path.join(OUT, 'assets/yt'), { recursive: true, force: true });
let ytOk = 0; for (const u of ytSet) { const out = path.join(OUT, refFor(u).slice(1)); fs.mkdirSync(path.dirname(out), { recursive: true }); try { fs.writeFileSync(out, await fetchBuf(u)); ytOk++; } catch {} }
for (const u of ytSet) { const r = refFor(u); if (r) refMap.push([canon(u), r]); }
sortRefs();
if (ytSet.size) console.log('yt thumbnails:', ytOk, '/', ytSet.size);

// ---- 3) analysis: Rive + YouTube ids from the (never-shipped) bundles ----
const BUNDLES = path.join(WORK, 'bundles');
const bundleFiles = fs.existsSync(BUNDLES) ? fs.readdirSync(BUNDLES).filter(f => f.endsWith('.mjs')) : [];
let riveVer = null; const ytIds = new Set();
const YTID = /(?:youtube(?:-nocookie)?\.com\/embed\/|i\.ytimg\.com\/vi(?:_webp)?\/|[?&]v=)([A-Za-z0-9_-]{11})/g;
for (const f of bundleFiles) {
  const t = fs.readFileSync(path.join(BUNDLES, f), 'utf8');
  if (!riveVer) { const m = t.match(/@rive-app\/canvas","version":"([\d.]+)"/); if (m) riveVer = m[1]; }
  for (const m of t.matchAll(YTID)) ytIds.add(m[1]);
}
for (const p of pageList) { const t = fs.readFileSync(path.join(WORK, 'pages', p.slug + '.html'), 'utf8'); for (const m of t.matchAll(YTID)) ytIds.add(m[1]); }
const rivFiles = fs.existsSync(path.join(OUT, 'media')) ? fs.readdirSync(path.join(OUT, 'media')).filter(f => f.endsWith('.riv')) : [];
if (riveVer || rivFiles.length) {
  fs.mkdirSync(path.join(OUT, 'assets/lib'), { recursive: true });
  const v = riveVer ? '@' + riveVer : '';
  for (const [file, dest] of [['rive.js', 'assets/lib/rive.js'], ['rive.wasm', 'assets/lib/rive.wasm']]) {
    try { fs.writeFileSync(path.join(OUT, dest), await fetchBuf(`https://unpkg.com/@rive-app/canvas${v}/${file}`)); } catch (e) { console.warn('rive dl fail', file, e.message); }
  }
  console.log(`rive: ${rivFiles.length} .riv file(s), standalone runtime saved to /assets/lib/rive.{js,wasm} — Rive canvases need a site.js repair (see SKILL.md)`);
}
fs.writeFileSync(path.join(WORK, 'analysis.json'), JSON.stringify({ riveVersion: riveVer, rivFiles, youtubeIds: [...ytIds] }, null, 2));

// ---- 4) reveal planning: which SSR-hidden elements must become visible? ----
// Ground truth = hydrated-live census (snapshot.mjs). A hidden framer-class is
// revealed iff at least one live instance ends visible; target opacity = the max the
// live site reaches (decorative layers often settle at e.g. 0.15, not 1); transform
// is only cleared when every visible live instance ends at identity (never break
// translate(-50%,-50%) layout centering). Classes never visible live = hover
// overlays and stay hidden.
const GENERIC = new Set(['framer-text', 'framer-body', 'framer-page', 'framer-lightbox']);
const pickCls = clsAttr => clsAttr.split(/\s+/).find(c => /^framer-[A-Za-z0-9_-]+$/.test(c) && !GENERIC.has(c) && !c.startsWith('framer-v-') && !c.startsWith('framer-styles-preset'));
const candidates = new Map(); // cls -> { ssrOpacity, appearId }
for (const p of pageList) {
  const t = fs.readFileSync(path.join(WORK, 'pages', p.slug + '.html'), 'utf8');
  for (const m of t.matchAll(/<[a-z][a-z0-9]*\b[^>]*>/gi)) {
    const tag = m[0];
    const style = tag.match(/\bstyle="([^"]*)"/i)?.[1]; if (!style) continue;
    const op = style.match(/(?:^|;)\s*opacity:\s*([\d.]+)/); if (!op || +op[1] >= 0.05) continue;
    const cls = tag.match(/\bclass="([^"]*)"/i)?.[1] && pickCls(tag.match(/\bclass="([^"]*)"/i)[1]); if (!cls) continue;
    const prev = candidates.get(cls) || { ssrOpacity: +op[1], appearId: false };
    prev.appearId = prev.appearId || /data-framer-appear-id/.test(tag);
    candidates.set(cls, prev);
  }
}
const liveByCls = new Map(); // cls -> [{opacity, transform}]
if (fs.existsSync(LIVE)) {
  for (const f of fs.readdirSync(LIVE).filter(f => f.startsWith('census-') && f.endsWith('.json'))) {
    try { for (const it of JSON.parse(fs.readFileSync(path.join(LIVE, f), 'utf8')).items) (liveByCls.get(it.cls) || liveByCls.set(it.cls, []).get(it.cls)).push(it); } catch {}
  }
} else console.warn('! _work/live/ missing — run snapshot.mjs first. Falling back to a conservative reveal set (appear elements only); scroll-revealed content may stay hidden.');
const reveal = []; let skippedHidden = 0, unseen = 0;
for (const [cls, info] of candidates) {
  const live = liveByCls.get(cls);
  if (live) {
    const vis = live.filter(i => i.opacity >= 0.05);
    if (!vis.length) { skippedHidden++; continue; } // hover overlay etc. — stays hidden
    const o = Math.min(1, Math.round(Math.max(...vis.map(i => i.opacity)) * 100) / 100);
    reveal.push({ s: '.' + cls, o, t: vis.every(i => i.transform === 'none') ? 1 : 0 });
  } else if (info.ssrOpacity > 0 || info.appearId) {
    // framer-motion optimized-appear tell (opacity:0.001) or an appear element the
    // census missed — end state is visible; opacity only (transform unknown).
    reveal.push({ s: '.' + cls, o: 1, t: 0 }); unseen++;
  } else { skippedHidden++; console.log(`  ? .${cls} hidden in SSR, never seen visible live — left hidden`); }
}
console.log(`reveal plan: ${reveal.length} classes revealed (${unseen} unseen-in-census), ${skippedHidden} left hidden`);
fs.mkdirSync(path.join(OUT, 'assets/js'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'assets/css'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets/js/reveal-config.js'), `// generated by strip.mjs — do not edit (put repairs in site.js)\nwindow.__FTC_REVEAL__=${JSON.stringify(reveal)};\n`);
fs.writeFileSync(path.join(OUT, 'assets/css/reveal.css'),
  `/* generated by strip.mjs — no-JS fallback so nothing stays invisible. Do not edit (site.css is yours). */\n` +
  `html:not(.js) [data-framer-appear-id]{opacity:1!important;transform:none!important}\n` +
  reveal.map(r => `html:not(.js) ${r.s}{opacity:${r.o}!important${r.t ? ';transform:none!important' : ''}}`).join('\n') + '\n');

// ---- 5) shim + repair stubs ----
fs.copyFileSync(path.join(SCRIPTS, 'assets/appear-shim.js'), path.join(OUT, 'assets/js/appear-shim.js'));
if (!fs.existsSync(path.join(OUT, 'assets/js/site.js'))) fs.writeFileSync(path.join(OUT, 'assets/js/site.js'), `// site.js — hand-written vanilla JS repairs (menus, accordions, embeds...).\n// strip.mjs never overwrites this file.\n`);
if (!fs.existsSync(path.join(OUT, 'assets/css/site.css'))) fs.writeFileSync(path.join(OUT, 'assets/css/site.css'), `/* site.css — hand-written repair styles. strip.mjs never overwrites this file. */\n`);

// ---- 6) process pages: classify scripts, strip runtime, localize, inject ----
function classifyScripts(t, slug, stats) {
  return t.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    // KEEP: Framer's self-contained appear system (JSON data + WAAPI animator + bootstrap)
    if (/type="framer\/appear"/i.test(attrs) || /data-framer-appear-animation/i.test(attrs)) { stats.kept++; return m; }
    if (/^\s*var animator=/.test(body)) { stats.kept++; return m; }
    // KEEP: pre-hydration nested-link handler — self-contained; without the runtime it
    // is the only thing that makes [data-nested-link] elements navigate.
    if (/data-nested-link/.test(body)) { stats.kept++; return m; }
    // KILL: module bundles, hydration handover, variant-param plumbing
    if (/type="module"|data-framer-bundle|type="framer\/handover"|data-preserve-internal-params/i.test(attrs)) { stats.removed++; return ''; }
    // KILL: analytics + framer telemetry loaders by src
    if (/\bsrc="[^"]*(?:events\.framer\.com|googletagmanager\.com|google-analytics\.com|clarity\.ms|framerusercontent\.com\/sites\/)/i.test(attrs)) { stats.removed++; return ''; }
    // KILL: hydration/telemetry inline fingerprints
    if (/__framer_force_showing_editorbar|performance\.clearMeasures|"scheduler"in window|isInputPending|framer_variant|Date\.prototype\.toLocaleString|window\.process=\{\.\.\.window\.process/.test(body)) { stats.removed++; return ''; }
    // KILL: analytics inline fingerprints (same set the classic build strips)
    if (/gtag\s*\(|googletagmanager\.com|google-analytics\.com|clarity|events\.framer\.com|fbq\(|_hsq|posthog|hotjar/i.test(body)) { stats.removed++; return ''; }
    if (!body.trim() && !/\bsrc=/i.test(attrs)) { stats.removed++; return ''; } // empty leftovers
    // Anything else is site custom code — keep it, but say so (audit trail).
    stats.kept++; stats.unknown++;
    console.log(`  ? kept unknown script on ${slug} (len=${body.length}): ${(body || attrs).replace(/\s+/g, ' ').trim().slice(0, 80)}`);
    return m;
  });
}
const INJECT_HEAD = `<script>document.documentElement.classList.add('js')</script><link rel="stylesheet" href="/assets/css/reveal.css"><link rel="stylesheet" href="/assets/css/site.css">`;
const INJECT_BODY = `<script src="/assets/js/reveal-config.js" defer></script><script src="/assets/js/appear-shim.js" defer></script><script src="/assets/js/site.js" defer></script>`;
function cleanHtml(t, slug, stats) {
  t = classifyScripts(t, slug, stats);
  t = t.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, '');
  t = t.replace(/<link\b[^>]*rel="preconnect"[^>]*>/gi, '');
  t = t.replace(/<link\b[^>]*framerusercontent\.com\/sites\/[^>]*>/gi, ''); // any leftover bundle hint
  t = t.replace(/<meta\b[^>]*name="framer-search-index[^"]*"[^>]*>/gi, ''); // runtime-search data, unused without the runtime
  t = t.replace(/https?:\/\/fonts\.googleapis\.com\/css2[^"'`)<>\\]*/g, GOOGLE_CSS);
  t = localize(t);
  t = t.replace(/<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/gi, '');
  // Self-domain anchors -> root-relative (site must be hosted at the domain root anyway;
  // "./path" would resolve wrongly from nested pages like /blog/x).
  t = t.replace(new RegExp(`(<a\\b[^>]*\\bhref=")https?:\\/\\/${esc(HOST)}(\\/[^"]*)"`, 'g'), (_m, a, b) => `${a}${b}"`);
  t = t.replace(/(<meta\b[^>]*\b(?:property|name)="(?:og:image|twitter:image)"[^>]*\bcontent=")(\/[^"]*)"/gi, (_m, a, b) => `${a}${ORIGIN}${b}"`);
  t = t.replace(/(<meta\b[^>]*\bcontent=")(\/[^"]*)("[^>]*\b(?:property|name)="(?:og:image|twitter:image)")/gi, (_m, a, b, c) => `${a}${ORIGIN}${b}${c}`);
  t = t.replace(/<head([^>]*)>/i, `<head$1>${SW_KILLER}${INJECT_HEAD}`);
  t = t.replace(/<\/body>/i, `${INJECT_BODY}</body>`);
  return t;
}
for (const p of pageList) {
  const stats = { kept: 0, removed: 0, unknown: 0 };
  const out = cleanHtml(fs.readFileSync(path.join(WORK, 'pages', p.slug + '.html'), 'utf8'), p.slug, stats);
  const fp = path.join(OUT, fileFor(p));
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, out);
  const leak = (out.match(/https?:\/\/(?:framerusercontent\.com|fonts\.g(?:static|oogleapis)\.com|events\.framer\.com|i\.ytimg\.com|unpkg\.com|app\.framerstatic\.com|clarity\.ms|(?:www\.)?googletagmanager\.com|(?:www\.)?google-analytics\.com)/g) || []).length;
  const runtime = (out.match(/\.mjs\b/g) || []).length;
  console.log(`  page ${p.slug.padEnd(20)} leak-refs=${leak} runtime-refs=${runtime} scripts: kept=${stats.kept} removed=${stats.removed} unknown=${stats.unknown}`);
}

// ---- 7) Google Fonts stylesheet (localized) ----
let gcss = '';
for (const g of manifest.gapi) { try { gcss += `/* ${g} */\n` + (await (await fetch(g, { headers: { 'User-Agent': UA } })).text()) + '\n'; } catch {} }
gcss = localize(gcss);
fs.writeFileSync(path.join(OUT, 'assets/css/google-fonts.css'), gcss);

// ---- 8) host configs + extras ----
const w = (rel, content) => fs.writeFileSync(path.join(OUT, rel), content);
w('.nojekyll', '');
w('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  pageList.map(p => `<url><loc>${ORIGIN}${routeOf(p)}</loc></url>`).join('\n') + `\n</urlset>\n`);
w('vercel.json', JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json', framework: null, buildCommand: null,
  outputDirectory: '.', installCommand: "echo 'static site — no install/build'",
  cleanUrls: true, trailingSlash: false,
  headers: [
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/(images|videos|media)/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
  ],
}, null, 2) + '\n');
w('netlify.toml', `[build]\n  publish = "."\n\n[[headers]]\n  for = "/assets/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n\n[[headers]]\n  for = "/images/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n`);
w('404.html', `<!doctype html><html lang="en"><head>${SW_KILLER}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;color:#1a1a1a;text-align:center}h1{font-size:72px;margin:0}p{color:#666}a{color:inherit}</style></head><body><div><h1>404</h1><p>This page could not be found.</p><p><a href="/">&larr; back home</a></p></div></body></html>\n`);
w('server.mjs', SERVER_JS());
console.log('STRIP done. Pages:', pageList.length, '| host:', HOST, '| shipped JS: appear-shim + reveal-config + site.js only');

function SERVER_JS() {
  return `// Zero-dependency local preview:  node server.mjs  -> http://localhost:4178
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url)); const PORT = process.env.PORT || 4178;
const MIME = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.wasm':'application/wasm','.riv':'application/octet-stream' };
function resolveFile(u){ let p=decodeURIComponent(u.split('?')[0]); if(p.endsWith('/'))p+='index.html'; const fp=path.join(ROOT,p); if(fs.existsSync(fp)&&fs.statSync(fp).isFile())return fp; if(fs.existsSync(fp+'.html'))return fp+'.html'; if(fs.existsSync(fp)&&fs.statSync(fp).isDirectory()){const i=path.join(fp,'index.html'); if(fs.existsSync(i))return i;} return null; }
http.createServer((req,res)=>{ const fp=resolveFile(req.url); if(!fp){const nf=path.join(ROOT,'404.html'); if(fs.existsSync(nf)){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(nf).pipe(res);} res.writeHead(404);return res.end('404');} const type=MIME[path.extname(fp).toLowerCase()]||'application/octet-stream'; const stat=fs.statSync(fp); const range=req.headers.range; if(range&&/^bytes=/.test(range)){const[s,e]=range.replace('bytes=','').split('-'); const start=parseInt(s,10)||0,end=e?parseInt(e,10):stat.size-1; res.writeHead(206,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Range':\`bytes \${start}-\${end}/\${stat.size}\`,'Content-Length':end-start+1}); fs.createReadStream(fp,{start,end}).pipe(res);} else { res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size,'Accept-Ranges':'bytes'}); fs.createReadStream(fp).pipe(res);} }).listen(PORT,()=>console.log('preview at http://localhost:'+PORT));
`;
}
