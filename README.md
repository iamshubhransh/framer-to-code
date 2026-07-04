# framer-to-code

A Claude Code plugin that converts a **Framer-published website into a fully
self-contained coded static site** — just paste the Framer URL. The output deploys
to any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages) with no build
step and **zero external requests, zero 404s, zero console errors**.

## Two modes

| | `framer-to-code` (mirror) | `framer-to-code-hard` (runtime-free) |
|---|---|---|
| Framer runtime | Kept, fully localized & patched | **Removed entirely** — no React, no hydration |
| JS shipped | Framer's bundles (~1 MB+), self-hosted | **< 10 KB** vanilla JS (appear shim + repairs) |
| Fidelity | Pixel-perfect incl. all runtime interactions | ~95% automatic; interactions rebuilt by hand |
| Animations | All original (runtime replays them) | Appear/scroll-in replayed by a tiny shim |
| Menus, carousels, counters… | Just work | Rebuilt as auditable vanilla JS in a repair loop |
| Best for | Exact low-maintenance copy | Owning a lean codebase, fastest first paint |

**Mirror mode** downloads every page, image, video, font, and the Framer JS runtime
(so animations and interactions still work), repoints everything to local paths, and
strips Framer analytics + the editor bar.

**Hard mode** ships only Framer's SSR HTML/CSS (which is complete and responsive on
its own), classifies and strips every runtime script, snapshots the hydrated live
site as ground truth, auto-plans which hidden elements to reveal, and drives an
agentic repair loop where broken interactive components are rebuilt as tiny
hand-written vanilla JS. Ask for it with "strip the Framer runtime" / "no react".

## Install

### npx (recommended)

```bash
npx framer-to-code
```

Installs both skills into `~/.claude/skills/` (use `--only <name>` for one).
Restart Claude Code, then in any project paste a Framer site URL and ask to
convert it — the right skill triggers automatically. Re-run any time to update
to the latest version. Requires Node 18+.

### One-line install (no Node required)

```bash
curl -fsSL https://raw.githubusercontent.com/iamshubhransh/framer-to-code/main/install.sh | bash
```

> Like to read before you pipe to `bash`? [Review `install.sh`](./install.sh) first,
> or clone the repo and run `./install.sh` locally.

### Or install as a Claude Code plugin

```text
/plugin marketplace add iamshubhransh/framer-to-code
/plugin install framer-to-code@framer-to-code
```

Update later with `/plugin marketplace update framer-to-code`.

**Prerequisites:** Node 18+. For the verification pass (required in hard mode): `npm i -D playwright && npx playwright install chromium`.

## What it does

**Mirror mode** (`framer-to-code`):

1. **Crawl** — discovers all pages via `sitemap.xml`, downloads every asset, walks the JS module graph.
2. **Build** — relocates media to the root paths Framer's runtime expects, localizes every URL, patches the runtime (Google Fonts, the editor bar, Rive WASM, YouTube thumbnails), strips analytics, injects a stale-service-worker cleanup, and writes host configs.
3. **Verify** — loads every page in a headless browser and reports any remote leak, 404, or console error, then iterates until clean.

**Hard mode** (`framer-to-code-hard`):

1. **Crawl** — same discovery; Framer bundles are downloaded for analysis only, never shipped.
2. **Snapshot** — loads the live site with the runtime running (desktop + mobile), records the hydrated DOM, screenshots, and a per-element visibility census — the ground truth.
3. **Strip** — classifies every script (keeps Framer's self-contained inline appear animator, kills bundles/hydration/telemetry, audits unknowns), localizes assets, plans element reveals from the census, injects a ~2.5 KB IntersectionObserver+WAAPI appear shim.
4. **Verify** — asserts zero `.mjs` requests + zero leaks/404s, and diffs live-vs-local element visibility into a repair worklist.
5. **Repair loop** — Claude rebuilds what the runtime powered (menus, counters, carousels, embeds) as tiny vanilla JS in `site.js`/`site.css`, guided by the report and screenshot pairs.

## Known Framer gotchas it handles

- Runtime asset paths (`/images`, `/videos`, `/media`) — and the "must host at domain root" rule
- `new URL("/path")` hydration crashes from localized asset URLs
- Sitemaps that list the canonical `*.framer.app` host instead of the custom domain
- Framer's built-in fonts from `app.framerstatic.com` (Inter, etc.)
- The `framer.com/edit` editor-bar cascade, Rive WASM from unpkg, YouTube thumbnails
- Microsoft Clarity + Framer analytics
- The stale Framer **service worker** that serves the old site to returning visitors after migration

See the skill's `SKILL.md` for the full reference table.

## Repo layout

```
package.json                             # npm package — `npx framer-to-code` installer
bin/install.mjs                          # npx entry point (copies skills to ~/.claude/skills)
install.sh                               # curl|bash installer (no Node required)
.claude-plugin/marketplace.json          # marketplace catalog
plugins/framer-to-code/
├── .claude-plugin/plugin.json           # plugin manifest
├── skills/framer-to-code/               # mirror mode
│   ├── SKILL.md
│   └── scripts/{crawl,build,verify}.mjs
└── skills/framer-to-code-hard/          # runtime-free mode
    ├── SKILL.md
    └── scripts/
        ├── {crawl,snapshot,strip,verify-hard}.mjs
        ├── census.mjs                   # shared live/local measurement
        └── assets/appear-shim.js        # the ~2.5 KB runtime replacement
```

## License

MIT — see [LICENSE](./LICENSE).
