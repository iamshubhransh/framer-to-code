#!/usr/bin/env node
//
// framer-to-code installer (npx entry point)
//
//   npx framer-to-code
//
// Copies the bundled `framer-to-code` skill into ~/.claude/skills so Claude
// Code picks it up automatically. The skill ships inside this package, so the
// install works offline and is pinned to whatever version you ran via npx.
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
      'Install the framer-to-code Claude Code skill into ~/.claude/skills.',
      '',
      'Usage:',
      '  npx framer-to-code [options]',
      '',
      'Options:',
      '  -h, --help       Show this help',
      '  -v, --version    Print the version',
      '      --dir <path> Install into <path>/framer-to-code instead of ~/.claude/skills',
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

// ---- locate the bundled skill ---------------------------------------------
const SOURCE = path.join(PKG_ROOT, 'plugins', 'framer-to-code', 'skills', 'framer-to-code');
if (!fs.existsSync(path.join(SOURCE, 'SKILL.md'))) {
  die(`Could not find the bundled skill at ${SOURCE}. This looks like a broken package — please report it.`);
}

// ---- resolve destination ---------------------------------------------------
const dirFlagIdx = argv.findIndex((a) => a === '--dir');
const baseDir =
  dirFlagIdx !== -1 && argv[dirFlagIdx + 1]
    ? path.resolve(argv[dirFlagIdx + 1])
    : process.env.CLAUDE_SKILLS_DIR
      ? path.resolve(process.env.CLAUDE_SKILLS_DIR)
      : path.join(os.homedir(), '.claude', 'skills');

const DEST = path.join(baseDir, 'framer-to-code');

// ---- install ---------------------------------------------------------------
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

ok(`Installed ${bold('framer-to-code')} v${PKG.version} to ${dim(DEST)}`);
console.log();
info('Next steps');
console.log('  1. Restart Claude Code (or start a new session) so it loads the skill.');
console.log('  2. In any project, paste a Framer site URL and ask to convert it.');
console.log(`  3. ${dim('For the verification pass:')} npm i -D playwright && npx playwright install chromium`);
console.log();
console.log(dim('Prefer the marketplace? /plugin marketplace add iamshubhransh/framer-to-code'));
