// verify-hard.mjs [OUT_DIR]   (requires: server.mjs running + playwright)
// Verification for the RUNTIME-FREE build. Per page it checks:
//   - RUNTIME-ZERO: no .mjs / framerusercontent.com/sites/ request may fire, and the
//     shipped HTML must contain no bundle/modulepreload markers        -> must be 0
//   - REMOTE leaks (minus the user-approved _work/allow-remote.json allowlist)
//   - LOCAL 404s, console errors / page errors
//   - LIVE DIFF (when _work/live/ exists): same census as snapshot.mjs at both
//     viewports, then live-vs-local per element: what's missing locally
//     (runtime-mounted -> graft) and what's stuck hidden (-> reveal/fix).
// Writes _work/verify-hard-report.json — the repair loop's worklist.
// Pass --shots to save full-page screenshots to <OUT>/_work/shots/ (named to pair
// with _work/live/shot-*.png for side-by-side comparison).
import fs from 'node:fs';
import path from 'node:path';
import { VIEWPORTS, CENSUS_FN, scrollSettle, loadPlaywright } from './census.mjs';

const OUT = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'site');
const SHOTS = process.argv.includes('--shots');
const PORT = process.env.PORT || 4178;
const LOCAL = `http://localhost:${PORT}`;
const WORK = path.join(OUT, '_work');
const LIVE = path.join(WORK, 'live');
const pages = JSON.parse(fs.readFileSync(path.join(WORK, 'pages.json'), 'utf8'));
const routeOf = p => new URL(p.url).pathname.replace(/\/+$/, '') || '/';
const MJS = u => /\.mjs(\?|$)/.test(u) || /framerusercontent\.com\/sites\//.test(u);
let allow = [];
try { allow = JSON.parse(fs.readFileSync(path.join(WORK, 'allow-remote.json'), 'utf8')); } catch { }
const isAllowed = u => allow.some(a => u.includes(a));

// ---- static assertion: shipped HTML must be runtime-marker-free ----
let staticBad = 0;
const htmlFiles = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const fp = path.join(d, f); if (f === '_work' || f === 'node_modules') continue; if (fs.statSync(fp).isDirectory()) walk(fp); else if (f.endsWith('.html')) htmlFiles.push(fp); } })(OUT);
for (const f of htmlFiles) {
  const t = fs.readFileSync(f, 'utf8');
  for (const marker of ['data-framer-bundle', 'rel="modulepreload"', 'framerusercontent.com/sites/']) {
    if (t.includes(marker)) { console.log(`STATIC ${path.relative(OUT, f)} still contains ${marker}`); staticBad++; }
  }
}

const { chromium } = await loadPlaywright(OUT);
const shotDir = path.join(WORK, 'shots');
if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const report = { pages: {} };
let totalLeaks = 0, total404 = 0, totalErr = 0, totalMjs = 0, totalMissing = 0, totalHidden = 0;

for (const p of pages) {
  const route = routeOf(p);
  const leaks = new Set(), allowed = new Set(), bad = new Set(), errs = [], mjsReqs = new Set();
  const diff = {};
  for (const [vp, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport });
    const pg = await ctx.newPage();
    pg.on('request', r => {
      const u = r.url();
      if (MJS(u)) mjsReqs.add(u.split('?')[0]);
      if (!u.startsWith(LOCAL) && !u.startsWith('data:') && !u.startsWith('blob:')) (isAllowed(u) ? allowed : leaks).add(u.split('?')[0]);
    });
    pg.on('response', r => { const u = r.url(); if (u.startsWith(LOCAL) && r.status() >= 400) bad.add(r.status() + ' ' + u.replace(LOCAL, '')); });
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    pg.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 160)));
    try {
      await pg.goto(LOCAL + route, { waitUntil: 'networkidle', timeout: 45000 });
      await scrollSettle(pg, 1200);
      const local = await pg.evaluate(CENSUS_FN);
      if (SHOTS) await pg.screenshot({ path: path.join(shotDir, `shot-${p.slug}-${vp}.png`), fullPage: true, animations: 'disabled' });
      // live-vs-local census diff
      const liveFile = path.join(LIVE, `census-${p.slug}-${vp}.json`);
      if (fs.existsSync(liveFile)) {
        const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
        const loc = new Map(local.items.map(i => [i.key, i]));
        const missing = [], hidden = [];
        for (const li of live.items) {
          if (li.opacity < 0.05) continue;              // hidden live too — nothing to match
          const lo = loc.get(li.key);
          if (!lo) missing.push({ key: li.key, framerName: li.framerName, rect: li.rect });
          else if (lo.opacity < 0.05 || lo.visibility === 'hidden' || lo.display === 'none')
            hidden.push({ key: li.key, framerName: li.framerName, rect: li.rect, localOpacity: lo.opacity });
        }
        const hd = Math.abs(local.scrollHeight - live.scrollHeight) / live.scrollHeight;
        diff[vp] = {
          height: { live: live.scrollHeight, local: local.scrollHeight, deltaPct: Math.round(hd * 1000) / 10 },
          counts: { live: live.counts, local: local.counts },
          missingLocal: missing.slice(0, 60), hiddenLocal: hidden.slice(0, 60),
          missingTotal: missing.length, hiddenTotal: hidden.length,
        };
        totalMissing += missing.length; totalHidden += hidden.length;
      }
    } catch (e) { errs.push('NAV ' + vp + ' ' + e.message.slice(0, 100)); }
    await ctx.close();
  }
  totalLeaks += leaks.size; total404 += bad.size; totalErr += errs.length; totalMjs += mjsReqs.size;
  report.pages[p.slug] = { route, leaks: [...leaks], allowed: [...allowed], notFound: [...bad], errors: errs, mjsRequests: [...mjsReqs], diff };
  const d = diff.desktop, dm = diff.mobile;
  const diffStr = d ? ` | Δh=${d.height.deltaPct}% missing=${d.missingTotal}/${dm?.missingTotal ?? '-'} hidden=${d.hiddenTotal}/${dm?.hiddenTotal ?? '-'}` : ' | (no live census)';
  const flag = (leaks.size || bad.size || errs.length || mjsReqs.size) ? '⚠️ ' : '✓ ';
  console.log(`${flag}${route.padEnd(24)} leaks=${leaks.size} 404s=${bad.size} errors=${errs.length} mjs=${mjsReqs.size}${diffStr}`);
  [...mjsReqs].forEach(u => console.log('    MJS   ' + u));
  [...leaks].forEach(l => console.log('    LEAK  ' + l));
  [...allowed].forEach(a => console.log('    ALLOWED ' + a));
  [...bad].forEach(b => console.log('    404   ' + b));
  errs.slice(0, 4).forEach(e => console.log('    ERR   ' + e));
  if (d) { for (const m of d.missingLocal.slice(0, 5)) console.log(`    MISSING ${m.key} "${m.framerName}" @${m.rect.y}`); for (const h of d.hiddenLocal.slice(0, 5)) console.log(`    HIDDEN  ${h.key} "${h.framerName}" @${h.rect.y}`); }
}
await browser.close();
fs.writeFileSync(path.join(WORK, 'verify-hard-report.json'), JSON.stringify(report, null, 1));

const fail = totalLeaks || total404 || totalMjs || staticBad;
console.log(`\nTOTAL  leaks=${totalLeaks}  404s=${total404}  errors=${totalErr}  mjs-requests=${totalMjs}  static-markers=${staticBad}  missing=${totalMissing}  hidden=${totalHidden}`);
console.log(fail ? '<-- FIX leaks/404s/mjs first (see gotchas), then repair missing/hidden via site.js/site.css' :
  (totalMissing || totalHidden) ? 'runtime-free & leak-free ✓ — now repair missing/hidden items (see _work/verify-hard-report.json)' : 'ALL CLEAN ✓ runtime-free');
process.exit(fail ? 1 : 0);
