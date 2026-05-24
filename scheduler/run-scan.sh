#!/bin/bash
# run-scan.sh
# Fired by launchd. Boots a headless Claude Code session that runs a single
# puck-finder scanner skill end-to-end.
#
# Usage:
#   run-scan.sh <skill-name>            # e.g. nepean-hockey-school
#
# Why headless instead of a tmux nudge:
# - Independent of any live Brad/Adam/Morgan session
# - Survives crashes / restarts
# - Easy to grep logs per run
#
# Why the long sleep + caffeinate + open Chrome:
# - puck-finder skills NEED Chrome via the Claude-in-Chrome native host
# - caffeinate -i prevents idle sleep mid-run
# - open -ga 'Google Chrome' ensures Chrome is up; the extension auto-loads
#
# Auth path: skill writes via x-api-key (PUCK_FINDER_WRITE_KEY). No bearer
# token required. The plugin under user-scope already has the write key
# baked into each skill's SKILL.md.
#
# Logs: ~/Library/Logs/puckfinder-scheduler/<skill>-YYYYMMDD-HHMMSS.log

set -euo pipefail

SKILL="${1:-}"
if [ -z "$SKILL" ]; then
  echo "usage: $0 <skill-name>" >&2
  exit 2
fi

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
LOG_DIR="$HOME/Library/Logs/puckfinder-scheduler"
LOG="$LOG_DIR/${SKILL}-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG") 2>&1

echo ""
echo "==================================================="
echo "puckfinder-scan · skill=$SKILL · $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "==================================================="

# Bring Chrome up (no-op if already running). Wait so the Claude extension
# native-host socket is ready before we hand the prompt over.
open -ga "Google Chrome" || true
sleep 8

PROMPT="You are a scheduled puck-finder scanner. Run the puck-finder:${SKILL} skill end-to-end, INCLUDING the API submission step. The skill instructions live in its SKILL.md — follow them exactly. Do NOT ask follow-up questions; you have full permission to run the scan, scrape the source site via the Chrome extension, and POST the result to https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans with the x-api-key already documented in the skill. When the API returns success, print one line in this exact format and exit immediately: SCAN_COMPLETE provider=${SKILL} upserted=<N> added=<N> archived=<N>. If anything fails, print SCAN_FAILED followed by the error and exit."

# caffeinate -i prevents idle sleep for the duration of the child process.
# --dangerously-skip-permissions: this is a cron job, no human to approve.
# --chrome: enables the in-browser MCP tools the skills depend on.
exec caffeinate -i "$CLAUDE_BIN" \
  --dangerously-skip-permissions \
  --chrome \
  -p "$PROMPT"
