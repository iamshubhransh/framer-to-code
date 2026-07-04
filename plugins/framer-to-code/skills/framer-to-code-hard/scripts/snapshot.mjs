// snapshot.mjs <FRAMER_URL> [OUT_DIR]
// Ground truth for the hard (runtime-free) build: loads each page of the LIVE Framer
// site with the runtime running, scrolls it fully (fires appear animations + lazy
// mounts), then records what the hydrated page actually looks like:
//   _work/live/dom-<slug>.html            post-hydration DOM (desktop) for grafting
//   _work/live/shot-<slug>-<vp>.png       full-page screenshots (desktop + mobile)
//   _work/live/census-<slug>-<vp>.json    per-element visibility census (reveal planning)
//   _work/live/requests-<slug>.json       every request the live page makes
//   _work/live/interactive-summary.json   likely-interactive components (repair checklist)
// Run AFTER crawl.mjs (needs _work/pages.json). Requires playwright (installed in the
// output dir is fine: npm i -D playwright && npx playwright install chromium).
import fs from 'node:fs';
import path from 'node:path';
import { VIEWPORTS, CENSUS_FN, scrollSettle, loadPlaywright } from './census.mjs';

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
const OUT = path.resolve(process.argv[3] || 'site');
if (!BASE) { console.error('usage: node snapshot.mjs <framer-url> [out-dir]'); process.exit(1); }
const WORK = path.join(OUT, '_work');
const LIVE = path.join(WORK, 'live');
fs.mkdirSync(LIVE, { recursive: true });
const pageList = JSON.parse(fs.readFileSync(path.join(WORK, 'pages.json'), 'utf8'));

const { chromium } = await loadPlaywright(OUT);
const browser = await chromium.launch();
const interactive = {};  // name -> ["slug@vp"]

for (const p of pageList) {
  for (const [vp, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport });
    const pg = await ctx.newPage();
    const requests = new Set();
    pg.on('request', r => requests.add(r.url()));
    try {
      await pg.goto(p.url, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (e) { console.warn(`  NAV ${p.slug} ${vp}: ${e.message.slice(0, 100)} (continuing)`); }
    try {
      await scrollSettle(pg);
      const census = await pg.evaluate(CENSUS_FN);
      fs.writeFileSync(path.join(LIVE, `census-${p.slug}-${vp}.json`), JSON.stringify(census, null, 1));
      for (const n of census.interactiveNames) (interactive[n] ||= []).push(p.slug + '@' + vp);
      await pg.screenshot({ path: path.join(LIVE, `shot-${p.slug}-${vp}.png`), fullPage: true, animations: 'disabled' });
      if (vp === 'desktop') {
        fs.writeFileSync(path.join(LIVE, `dom-${p.slug}.html`), await pg.content());
        fs.writeFileSync(path.join(LIVE, `requests-${p.slug}.json`), JSON.stringify([...requests], null, 1));
      }
      console.log(`  ${p.slug.padEnd(24)} ${vp.padEnd(7)} h=${census.scrollHeight} els=${census.items.length} video=${census.counts.video} iframe=${census.counts.iframe} form=${census.counts.form}`);
    } catch (e) { console.warn(`  FAIL ${p.slug} ${vp}: ${e.message.slice(0, 120)}`); }
    await ctx.close();
  }
}

fs.writeFileSync(path.join(LIVE, 'interactive-summary.json'),
  JSON.stringify(Object.entries(interactive).map(([name, where]) => ({ name, where: [...new Set(where)] })), null, 2));
await browser.close();
console.log(`SNAPSHOT done: ${pageList.length} pages -> ${path.relative(process.cwd(), LIVE)}`);
console.log('interactive candidates:', Object.keys(interactive).join(', ') || '(none)');
