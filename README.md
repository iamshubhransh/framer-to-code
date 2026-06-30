# framer-to-code

A Claude Code plugin that converts a **Framer-published website into a fully
self-contained, pixel-perfect coded static site** — just paste the Framer URL.

It downloads every page, image, video, font, and the Framer JS runtime (so
animations and interactions still work), repoints everything to local paths,
strips Framer analytics + the editor bar, and verifies the result has **zero
external requests, zero 404s, and zero console errors**. The output deploys to any
static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages) with no build step.

## Install

### npx (recommended)

```bash
npx framer-to-code
```

Installs the skill into `~/.claude/skills/`. Restart Claude Code, then in any
project paste a Framer site URL and ask to convert it — the skill triggers
automatically. Re-run any time to update to the latest version. Requires Node 18+.

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

**Prerequisites:** Node 18+. For the verification pass: `npm i -D playwright && npx playwright install chromium`.

## What it does

1. **Crawl** — discovers all pages via `sitemap.xml`, downloads every asset, walks the JS module graph.
2. **Build** — relocates media to the root paths Framer's runtime expects, localizes every URL, patches the runtime (Google Fonts, the editor bar, Rive WASM, YouTube thumbnails), strips analytics, injects a stale-service-worker cleanup, and writes host configs.
3. **Verify** — loads every page in a headless browser and reports any remote leak, 404, or console error, then iterates until clean.

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
bin/install.mjs                          # npx entry point (copies skill to ~/.claude/skills)
install.sh                               # curl|bash installer (no Node required)
.claude-plugin/marketplace.json          # marketplace catalog
plugins/framer-to-code/
├── .claude-plugin/plugin.json           # plugin manifest
└── skills/framer-to-code/
    ├── SKILL.md                         # the skill
    └── scripts/{crawl,build,verify}.mjs # bundled tooling
```

## License

MIT — see [LICENSE](./LICENSE).
