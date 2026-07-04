// census.mjs — shared between snapshot.mjs (live site) and verify-hard.mjs (local
// build). Both must measure with EXACTLY the same rules or the diff is meaningless.
import path from 'node:path';

export const VIEWPORTS = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]];

// Runs in the page: visibility census of every framer-classed element that takes real
// space. `key` (class|name#n) is how verify-hard matches live elements to local ones.
export const CENSUS_FN = `(() => {
  const GENERIC = new Set(['framer-text','framer-body','framer-page','framer-lightbox']);
  const firstClass = el => [...el.classList].find(c => /^framer-[A-Za-z0-9_-]+$/.test(c) && !GENERIC.has(c) && !c.startsWith('framer-v-') && !c.startsWith('framer-styles-preset'));
  const seen = new Map(); const items = [];
  for (const el of document.querySelectorAll('[class*="framer-"]')) {
    // "Made in Framer" badge + editor bar are runtime junk the hard build removes on purpose
    if (el.closest('#__framer-badge-container, .__framer-badge, [class*="framer-badge"], #__framer-editorbar')) continue;
    const cls = firstClass(el); if (!cls) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 400) continue;
    const cs = getComputedStyle(el);
    const name = el.getAttribute('data-framer-name') || '';
    const base = cls + '|' + name;
    const n = (seen.get(base) || 0); seen.set(base, n + 1);
    const tf = cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : cs.transform;
    items.push({ key: base + '#' + n, tag: el.tagName.toLowerCase(), framerName: name, cls,
      rect: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      opacity: +cs.opacity, transform: tf, visibility: cs.visibility, display: cs.display });
  }
  const count = s => document.querySelectorAll(s).length;
  return { scrollHeight: document.documentElement.scrollHeight, items,
    counts: { button: count('button'), video: count('video'), iframe: count('iframe:not(#__framer-editorbar)'), canvas: count('canvas'), form: count('form') },
    interactiveNames: [...new Set([...document.querySelectorAll('[data-framer-name]')].map(e => e.getAttribute('data-framer-name')).filter(n => /menu|nav|burger|hamburger|tab|accordion|carousel|slider|modal|toggle|dropdown|faq|switch|search/i.test(n)))] };
})()`;

// Full incremental scroll: fires scroll-appear animations and lazy mounts, then settles.
export async function scrollSettle(pg, ms = 1500) {
  await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); } window.scrollTo(0, 0); });
  await pg.waitForTimeout(ms);
}

// Resolve playwright from the skill dir OR the output dir (where the skill tells the
// user to `npm i -D playwright` — the skill's own path is usually not in that chain).
export async function loadPlaywright(OUT) {
  const norm = m => (m && m.chromium ? m : (m && m.default) || m);
  try { return norm(await import('playwright')); } catch { }
  try {
    const { createRequire } = await import('node:module');
    const req = createRequire(path.join(OUT, 'noop.js'));
    return norm(await import('file://' + req.resolve('playwright')));
  } catch { }
  console.error('Playwright not installed. In the output dir run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
