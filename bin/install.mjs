#!/usr/bin/env node
//
// framer-to-code installer (npx entry point)
//
//   npx framer-to-code                       # installs both skills
//   npx framer-to-code --only framer-to-code-hard
//
// Copies the bundled skills (`framer-to-code` — pixel-perfect mirror, and
// `framer-to-code-hard` — Framer runtime removed entirely) into ~/.claude/skills
// so Claude Code picks them up automatically. The skills ship inside this
// package, so the install works offline and is pinned to the npx version.
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (...flags) => flags.some((f) => argv.includes(f));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));

if (has('-v', '--version')) {
  process.stdout.write(`${PKG.version}\n`);
  process.exit(0);
}
if (has('-h', '--help')) {
  process.stdout.write(
    [
      `framer-to-code v${PKG.version}`,
      '',
      'Install the framer-to-code Claude Code skills into ~/.claude/skills:',
      '  framer-to-code       pixel-perfect mirror (keeps the localized Framer runtime)',
      '  framer-to-code-hard  runtime removed entirely (no React, vanilla-JS repairs)',
      '',
      'Usage:',
      '  npx framer-to-code [options]',
      '',
      'Options:',
      '  -h, --help        Show this help',
      '  -v, --version     Print the version',
      '      --dir <path>  Install into <path>/ instead of ~/.claude/skills',
      '      --only <name> Install a single skill (framer-to-code | framer-to-code-hard)',
      '',
      'Environment:',
      '  CLAUDE_SKILLS_DIR  Override the skills directory (default ~/.claude/skills)',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

// ---- pretty output ---------------------------------------------------------
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const info = (s) => console.log(`${bold('==>')} ${s}`);
const ok = (s) => console.log(`${c('32', '✓')} ${s}`);
const warn = (s) => console.log(`${c('33', '!')} ${s}`);
const die = (s) => {
  console.error(`${c('31', '✗')} ${s}`);
  process.exit(1);
};

// ---- prerequisites ---------------------------------------------------------
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 18) {
  warn(`Node ${process.version} found, but the skill needs Node 18+ at run time. Conversions will fail until you upgrade.`);
} else {
  ok(`Node ${process.version} detected.`);
}

// ---- which skills ----------------------------------------------------------
const ALL_SKILLS = ['framer-to-code', 'framer-to-code-hard'];
const onlyIdx = argv.findIndex((a) => a === '--only');
const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
if (only && !ALL_SKILLS.includes(only)) die(`Unknown skill "${only}". Available: ${ALL_SKILLS.join(', ')}`);
const SKILLS = only ? [only] : ALL_SKILLS;

// ---- resolve destination ---------------------------------------------------
const dirFlagIdx = argv.findIndex((a) => a === '--dir');
const baseDir =
  dirFlagIdx !== -1 && argv[dirFlagIdx + 1]
    ? path.resolve(argv[dirFlagIdx + 1])
    : process.env.CLAUDE_SKILLS_DIR
      ? path.resolve(process.env.CLAUDE_SKILLS_DIR)
      : path.join(os.homedir(), '.claude', 'skills');

// ---- install ---------------------------------------------------------------
for (const skill of SKILLS) {
  const SOURCE = path.join(PKG_ROOT, 'plugins', 'framer-to-code', 'skills', skill);
  if (!fs.existsSync(path.join(SOURCE, 'SKILL.md'))) {
    die(`Could not find the bundled skill at ${SOURCE}. This looks like a broken package — please report it.`);
  }
  const DEST = path.join(baseDir, skill);
  try {
    if (fs.existsSync(DEST)) {
      warn(`Existing install at ${dim(DEST)} — replacing it.`);
      fs.rmSync(DEST, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    fs.cpSync(SOURCE, DEST, { recursive: true });
  } catch (err) {
    die(`Install failed: ${err.message}`);
  }
  ok(`Installed ${bold(skill)} v${PKG.version} to ${dim(DEST)}`);
}
console.log();
info('Next steps');
console.log('  1. Restart Claude Code (or start a new session) so it loads the skills.');
console.log('  2. In any project, paste a Framer site URL and ask to convert it —');
console.log(`     ${dim('say "strip the Framer runtime" to get the hard (runtime-free) variant.')}`);
console.log(`  3. ${dim('For verification (required in hard mode):')} npm i -D playwright && npx playwright install chromium`);
console.log();
console.log(dim('Prefer the marketplace? /plugin marketplace add iamshubhransh/framer-to-code'));
