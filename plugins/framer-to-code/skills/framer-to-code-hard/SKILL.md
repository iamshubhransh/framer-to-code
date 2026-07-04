---
name: framer-to-code-hard
description: >-
  Convert a Framer-published website into a runtime-free static site: the Framer
  runtime/renderer is REMOVED entirely — no React, no hydration, zero Framer .mjs
  shipped — while keeping the site visually identical and repairing interactions
  with tiny hand-written vanilla JS. Use when the user wants to strip the Framer
  runtime, get pure HTML/CSS, remove Framer's JavaScript/renderer engine, a
  lightweight or no-React export, or "framer to vanilla JS". Triggers: "strip the
  Framer runtime", "remove the Framer renderer/engine", "no react", "pure html
  css", "framer to vanilla js", "lightweight framer export", "remove framer
  javascript". For a guaranteed pixel-perfect mirror that KEEPS the (localized)
  runtime and all its interactions, use the sibling `framer-to-code` skill instead.
---

# Framer → Runtime-free Code (hard mode)

Turn a live Framer site (just its URL) into a **static site with the Framer runtime
completely removed**: no React, no hydration, none of Framer's ~1 MB+ of `.mjs`
bundles. What ships is the SSR HTML/CSS Framer already generated (which is complete
and responsive on its own), all assets localized, plus **< 10 KB of vanilla JS**: a
tiny appear-animation shim, a per-site reveal config, and hand-written repairs for
the interactive components the runtime used to power.

The price of removing the runtime: everything the runtime *did* has to be either
replayed (appear animations — automated here), revealed (SSR-hidden elements — planned
automatically from a hydrated-live census), or **rebuilt by you in the repair loop**
(menus, carousels, counters, embeds — Step 5). Expect ~95% visual parity out of the
box and a short repair session for the rest. If the user wants 100% fidelity with
zero repair work, offer the sibling `framer-to-code` skill instead.

## When to use / not use

- **Use** when the goal is owning a lean, runtime-free codebase: pure HTML/CSS +
  small vanilla JS, fast first paint, nothing executing that you didn't write.
- **Don't use** when the site leans hard on runtime features (client-side CMS
  filtering/search, complex multi-step component state, localization switching) and
  the user won't accept rebuilding or dropping them — mirror it with `framer-to-code`
  instead. Also not for a from-scratch redesign.

## Inputs

- **The Framer site URL** — pull it from the user's message. Pages are auto-discovered
  via `/sitemap.xml`.

## Prerequisites

- Node 18+ (global `fetch`, top-level `await`, ES modules).
- **Playwright is required** (not optional): the snapshot stage is what makes reveal
  planning and verification work. In the output dir: `npm i -D playwright && npx
  playwright install chromium`.

## Bundled scripts

Let `$SKILL` be this skill's directory and `$OUT` the project folder being built.

| Script | Purpose |
|---|---|
| `crawl.mjs <url> <out>` | Download pages + every asset. Framer bundles land in `_work/bundles/` for analysis only — never shipped. |
| `snapshot.mjs <url> <out>` | Ground truth: hydrated-live DOM, screenshots (desktop+mobile), per-element visibility census, interactive-component checklist → `_work/live/`. |
| `strip.mjs <url> <out>` | The hard build: classify & strip scripts, localize assets, plan reveals from the census, inject the appear shim, write configs. Safe to re-run — never touches your repairs. |
| `verify-hard.mjs <out>` | Headless check: zero runtime requests, zero leaks/404s, live-vs-local census diff → `_work/verify-hard-report.json`. |
| (strip also writes) `server.mjs` | Zero-dep local preview in `$OUT`. |

## Workflow

> Steps 1–4 are automated. Step 5 — the **repair loop** — is the heart of this skill:
> you act as the replacement for the Framer runtime, writing small vanilla JS/CSS
> fixes driven by the verify report and live-vs-local screenshots.

**Step 0 — Set up.** Pick `$OUT`. Confirm the URL is live (`curl -sI <url>`). Tell the
user the trade-off up front: runtime removed, most things survive automatically,
interactive components get rebuilt as vanilla JS (and list what the site seems to use).

**Step 1 — Crawl.**
```bash
node "$SKILL/scripts/crawl.mjs" "<FRAMER_URL>" "$OUT"
```
A couple of truncated-prefix failures (`/fontshare/`, `/s/`) are harmless.

**Step 2 — Snapshot the live site (required).**
```bash
cd "$OUT" && npm i -D playwright && npx playwright install chromium   # once
node "$SKILL/scripts/snapshot.mjs" "<FRAMER_URL>" "$OUT"
```
Loads every page of the ORIGINAL site with the runtime running, at 1440×900 and
390×844, full-scrolls to fire appear animations, then records the hydrated DOM,
full-page screenshots, an element visibility census, and
`_work/live/interactive-summary.json` — the list of components (menus, carousels,
FAQs…) you'll likely repair in Step 5.

**Step 3 — Strip.**
```bash
node "$SKILL/scripts/strip.mjs" "<FRAMER_URL>" "$OUT"
```
Every page must print **`leak-refs=0 runtime-refs=0`**. Review two things in the output:
- `? kept unknown script …` lines — site custom code the classifier didn't recognize.
  Read each one; keep if harmless (e.g. a widget the user wants), else remove it in a
  follow-up edit and note it.
- The reveal plan (`N classes revealed, M left hidden`) — hidden-forever classes are
  usually hover overlays; spot-check any surprises in Step 5.

What strip does: keeps Framer's self-contained inline appear animator when the publish
has one (many do — it's runtime-free WAAPI), keeps the pre-hydration nested-link
handler, kills the module bundles / hydration handover / telemetry / analytics /
editor-bar / variant-param scripts, removes `modulepreload`/`preconnect` and
search-index tags, localizes every asset URL, writes pages at their **real nested
paths** (`/blog/x` → `blog/x.html`), and injects: a `js` class on `<html>`,
`reveal.css` (no-JS fallback), `reveal-config.js` (per-site reveal list),
`appear-shim.js` (IntersectionObserver + WAAPI appear replay + video play-on-view),
and empty `site.js`/`site.css` stubs for your repairs.

**Step 4 — Preview & verify.**
```bash
cd "$OUT" && node server.mjs &        # http://localhost:4178
PORT=4178 node "$SKILL/scripts/verify-hard.mjs" "$OUT" --shots
```
⚠️ If anything looks inexplicably wrong, first confirm port 4178 is YOUR server
(`lsof -nP -iTCP:4178 -sTCP:LISTEN`) — a stale preview from an earlier session serving
a different folder produces baffling results.

Gate 1 (must be zero): `leaks=0 404s=0 mjs-requests=0 static-markers=0`. Fix any of
these before touching repairs (see gotchas).
Gate 2 (the repair worklist): `missing=… hidden=…` per page plus
`_work/verify-hard-report.json`. Δh (height delta) should be ~0%.

**Step 5 — Repair loop (you are the runtime now).** Iterate until the site holds up:

1. **Read the evidence.** `_work/verify-hard-report.json` (`missingLocal` /
   `hiddenLocal` per page/viewport), `_work/live/interactive-summary.json`, and
   compare screenshot pairs: `_work/live/shot-<slug>-<vp>.png` (truth) vs
   `_work/shots/shot-<slug>-<vp>.png` (yours). Full-page shots are ~12000px tall —
   crop sections (`sips --cropOffset <y> 0 --cropToHeightWidth 1600 1440 in.png --out
   crop.png`) and view them side by side.
2. **Triage each diff:**
   - `hiddenLocal` (element exists but stays invisible): usually an appear/reveal gap —
     add a rule to `site.css` (or extend the reveal config selector list) to show it.
   - `missingLocal` with key suffix `#1`, `#2`… while `#0` exists: the runtime CLONES
     elements (infinite logo tickers, marquees). Either accept a static row, or clone in
     `site.js` and animate with a CSS `@keyframes` scroll.
   - `missingLocal` at `#0`: content genuinely absent from SSR (runtime-mounted iframes,
     canvas, rotating tab panels captured mid-rotation). Graft the subtree from
     `_work/live/dom-<slug>.html` (its asset URLs localize to paths that already exist
     locally — crawl downloaded bundle-referenced media too), inject via `site.js`
     templates — NOT by editing page HTML, so `strip.mjs` re-runs stay safe.
   - Screenshot-only diffs (no census entry): dynamic state — carousels on a different
     slide, auto-rotating steps, counters. See recipes.
3. **Write repairs in `/assets/js/site.js` + `/assets/css/site.css` only.** Hook
   stable `framer-*` classes and `data-framer-name` attributes. Zero dependencies.
   Never re-add any Framer `.mjs`.
4. Re-run `verify-hard.mjs` (both gates) and re-compare shots after each batch.
   `strip.mjs` may be re-run any time — it regenerates its own files and leaves yours.

**Repair recipes (validated patterns):**

- **Mobile/hamburger menu.** Framer's "open" state is a runtime variant switch, but the
  closed SSR header usually already CONTAINS the menu markup, clipped by
  `overflow:hidden` + fixed bar height. Recipe: click handler on
  `[data-framer-name="Mobile Menu Icon"]` toggles a class; CSS for the open class sets
  `overflow: visible !important` on the header + nav wrapper and gives the nav panel a
  background/radius. Verify with a headless click test at 390×844.
- **Count-up stat counters show 0.** The count-up component SSRs its initial value.
  Pull final values from `_work/live/dom-<slug>.html`, key them by adjacent unique
  label text (never by DOM index — SSR contains 3 breakpoint copies of everything),
  then IO-triggered `requestAnimationFrame` count-up in `site.js`.
- **Accordion / FAQ.** Toggle a class; CSS `grid-template-rows: 0fr/1fr` + arrow rotate.
- **Tabs / auto-rotating steps.** SSR shows state 1 statically; other panels may be
  absent. Either freeze on state 1 (often fine), or graft panels from the live DOM and
  rotate with a small interval + click handlers.
- **Carousel / slider.** Prefer CSS `scroll-snap` + prev/next buttons scrolling by
  `clientWidth`. For autoplaying testimonial carousels, a ~solution is an interval that
  advances a class; live shots capture a different slide than local — that's fine,
  compare structure not slide index.
- **YouTube embeds.** SSR has the (localized) thumbnail; the iframe was runtime-mounted.
  Click-to-load: swap thumbnail for `youtube-nocookie.com/embed/<id>` iframe on click
  (ids in `_work/analysis.json`). Requires user consent for the remote domain — add
  `"youtube-nocookie.com"` to `_work/allow-remote.json` so verify reports it as ALLOWED.
- **Rive animations.** strip pre-downloads the standalone runtime to
  `/assets/lib/rive.{js,wasm}` when detected; `.riv` files are in `/media`. In
  `site.js`: create a canvas where the census says the element was, `new rive.Rive({src,
  canvas, autoplay:true, onLoad: r => r.resizeDrawingSurfaceToCanvas()})`.
- **Forms.** Framer's form backend is gone. Ask the user: wire to Formspree/Netlify
  Forms/their endpoint, or disable with a notice. Never leave a form silently dead.
- **Background videos.** Already handled — the shim plays muted videos on intersection.
  If one stays black, check its `preload`/`src` and add a `site.js` `.play()` call.

**Step 6 — Final verify.** Both gates + a manual click-through of nav, menus, and each
repaired component at both widths. Also `ls "$OUT"/assets/framer 2>/dev/null` must not
exist, and total shipped JS should be a few KB (`du -ch "$OUT"/assets/js/*.js`).

**Step 7 — Deliver & deploy.** Write a short README (what was removed, what was
rebuilt, the JS size before/after — bundles size is visible in `_work/bundles/`). Then
the same deployment notes as the sibling skill: static host, generated `vercel.json`/
`netlify.toml`/`.nojekyll`, **must be served from the domain root**, and the injected
service-worker cleanup handles returning visitors still holding Framer's old worker.
Git-ignore `_work/` and `node_modules/`.

## Hard-mode gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `mjs-requests>0` or `static-markers>0` in verify | A bundle reference survived strip (new publish variant). | Find it: `grep -rn "framerusercontent.com/sites\|modulepreload" "$OUT" --include='*.html'`. Extend the classifier/link-sweep in `strip.mjs`, re-run. |
| Element stays invisible locally, visible live (`hiddenLocal`) | Not in the reveal plan: census missed it (<400px², filtered class) or it's revealed by a runtime effect with no SSR tell. | Add a `site.css` opacity rule for its class, or extend `reveal-config.js` via strip re-run. |
| Whole sections missing vs live (`missingLocal` `#0`) | Runtime-mounted content absent from SSR (iframes, canvas, CMS-filtered lists, rotating panels). | Graft from `_work/live/dom-<slug>.html` via `site.js`; assets already exist locally. |
| Duplicate items missing (`#1`,`#2`…) | Runtime clones for infinite tickers/marquees. | Clone in `site.js` + CSS keyframes, or accept static. |
| `hiddenLocal`/`missingLocal` items that vary between verify runs | Auto-rotating carousel/steps captured on a different slide each snapshot; the other slides are stacked in SSR with opacity 0. | Do NOT blanket-reveal (slides overlap). Freeze on slide 1, or rebuild rotation via the carousel recipe. |
| Numbers/statistics show 0 | Count-up components SSR their start value. | Counter recipe above. |
| Hover effects gone on some cards | framer-motion `whileHover` variants died with the runtime (CSS `:hover` rules survive). | Rebuild important ones in `site.css` (`transition` + `:hover` transform/opacity). |
| Parallax / scroll-linked transforms static | Runtime scroll effects. | Accept static, or small `site.js` scroll handler for hero-critical ones. |
| A below-fold element flashes visible then animates | It entered the viewport before the shim's IO registered. | Harmless; if it bothers, lower the shim's `rootMargin` bottom inset. |
| Appear animations missing entirely on this site | Publish has no inline animator AND census fallback was used (snapshot skipped). | Run snapshot — reveal planning without it is conservative by design. |
| Language/locale switcher, site search dead | Entirely runtime features. | Remove the control (`site.css: display:none`) or rebuild; tell the user either way. |
| Verify results look insane (everything missing, wrong site) | **Stale preview server** on port 4178 from an earlier session. | `lsof -nP -iTCP:4178 -sTCP:LISTEN`, kill it, restart `server.mjs`. |
| `Δh` large on one page | A section collapsed (missing runtime-sized element) or un-clipped. | Compare that page's screenshot pair; fix the section, not the number. |

## Notes & limits (share with the user)

- **What survives automatically:** layout, typography, images/videos/fonts (all local),
  responsive breakpoints (CSS-driven), CSS hover states, appear/scroll-in animations
  (native animator + shim), plain links and anchors, background-video playback.
- **What gets rebuilt by hand:** menus, accordions, tabs, carousels, counters, embeds
  (YouTube/Rive), forms — via the repair loop, as auditable vanilla JS in `site.js`.
- **What's rebuilt-or-dropped, not mirrored:** client-side CMS search/filtering,
  locale switching, Framer form submissions, complex multi-step component state,
  page transitions (become normal navigations).
- The markup is still Framer-generated (verbose class names); this is a runtime
  removal, not a hand-rewrite. Re-running `crawl → snapshot → strip` re-syncs from the
  live site; your `site.js`/`site.css` repairs are preserved (re-check them after big
  redesigns of the source site).
