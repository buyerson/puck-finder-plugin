#!/bin/bash
# run-headless-scan.sh
# Fired by launchd for API-based scanners that don't need Chrome / Claude
# Code. Runs a TypeScript scanner under bun, logs to disk, exits non-zero
# on failure so launchd surfaces it.
#
# Usage:
#   run-headless-scan.sh <scanner-name>
#     where <scanner-name> matches scheduler/scanners/<scanner-name>.ts
#
# Logs: ~/Library/Logs/puckfinder-scheduler/<scanner>-headless-YYYYMMDD-HHMMSS.log

set -euo pipefail

SCANNER="${1:-}"
if [ -z "$SCANNER" ]; then
  echo "usage: $0 <scanner-name>" >&2
  exit 2
fi

REPO="$HOME/Projects/puck-finder-plugin"
SCRIPT="$REPO/scheduler/scanners/${SCANNER}.ts"
if [ ! -f "$SCRIPT" ]; then
  echo "no scanner at $SCRIPT" >&2
  exit 2
fi

BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"
LOG_DIR="$HOME/Library/Logs/puckfinder-scheduler"
LOG="$LOG_DIR/${SCANNER}-headless-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG") 2>&1

echo ""
echo "==================================================="
echo "puckfinder-headless-scan · scanner=$SCANNER · $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "==================================================="

exec "$BUN_BIN" run "$SCRIPT"
