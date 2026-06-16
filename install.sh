#!/usr/bin/env bash
#
# framer-to-code installer
#
# Installs the framer-to-code skill into ~/.claude/skills so Claude Code picks
# it up automatically. Works two ways:
#
#   Remote (one-liner):
#     curl -fsSL https://raw.githubusercontent.com/iamshubhransh/framer-to-code/main/install.sh | bash
#
#   Local (from a clone):
#     ./install.sh
#
set -euo pipefail

REPO_URL="https://github.com/iamshubhransh/framer-to-code.git"
REPO_TARBALL="https://github.com/iamshubhransh/framer-to-code/archive/refs/heads/main.tar.gz"
SKILL_NAME="framer-to-code"
SKILL_SUBPATH="plugins/framer-to-code/skills/framer-to-code"
DEST_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/$SKILL_NAME"

# ---- pretty output ---------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); GREEN=$(printf '\033[32m'); YELLOW=$(printf '\033[33m')
  RED=$(printf '\033[31m'); DIM=$(printf '\033[2m'); RESET=$(printf '\033[0m')
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi
info()  { printf '%s\n' "${BOLD}==>${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}!${RESET} $*"; }
die()   { printf '%s\n' "${RED}✗${RESET} $*" >&2; exit 1; }

# ---- prerequisites ---------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
    warn "Node $(node -v) found, but the skill needs Node 18+. Conversions will fail until you upgrade."
  else
    ok "Node $(node -v) detected."
  fi
else
  warn "Node not found. The skill needs Node 18+ at run time — install it before converting a site."
fi

# ---- locate the skill source ----------------------------------------------
# If this script is being run from inside a checkout, copy from there.
# Otherwise download a fresh copy into a temp dir.
SOURCE=""
CLEANUP_TMP=""

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/$SKILL_SUBPATH/SKILL.md" ]; then
  SOURCE="$SCRIPT_DIR/$SKILL_SUBPATH"
  info "Installing from local checkout."
else
  TMP=$(mktemp -d 2>/dev/null || mktemp -d -t framer-to-code)
  CLEANUP_TMP="$TMP"
  trap '[ -n "$CLEANUP_TMP" ] && rm -rf "$CLEANUP_TMP"' EXIT
  if command -v git >/dev/null 2>&1; then
    info "Fetching framer-to-code…"
    git clone --depth 1 "$REPO_URL" "$TMP/repo" >/dev/null 2>&1 \
      || die "git clone failed. Check your network or clone manually from $REPO_URL"
    SOURCE="$TMP/repo/$SKILL_SUBPATH"
  elif command -v curl >/dev/null 2>&1; then
    info "Fetching framer-to-code (tarball)…"
    curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP" \
      || die "Download failed. Check your network or install git and retry."
    SOURCE="$TMP/framer-to-code-main/$SKILL_SUBPATH"
  else
    die "Need either git or curl to download. Please install one and retry."
  fi
  [ -f "$SOURCE/SKILL.md" ] || die "Could not find the skill in the download. Please report this issue."
fi

# ---- install ---------------------------------------------------------------
if [ -d "$DEST_DIR" ]; then
  warn "Existing install at $DEST_DIR — replacing it."
  rm -rf "$DEST_DIR"
fi
mkdir -p "$(dirname "$DEST_DIR")"
cp -R "$SOURCE" "$DEST_DIR"

ok "Installed ${BOLD}$SKILL_NAME${RESET} to ${DIM}$DEST_DIR${RESET}"
echo
info "Next steps"
printf '  %s\n' "1. Restart Claude Code (or start a new session) so it loads the skill."
printf '  %s\n' "2. In any project, paste a Framer site URL and ask to convert it."
printf '  %s\n' "3. ${DIM}For the verification pass:${RESET} npm i -D playwright && npx playwright install chromium"
echo
printf '%s\n' "${DIM}Prefer the marketplace? /plugin marketplace add iamshubhransh/framer-to-code${RESET}"
