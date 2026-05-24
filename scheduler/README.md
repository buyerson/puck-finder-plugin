# puck-finder scheduler

Daily launchd jobs that populate the puck-finder DB from each provider's
source site. Two runners depending on whether the provider exposes a clean
HTTP API.

## Architecture

Two runner shapes, picked per provider:

**Chrome-driven (LLM skill)** — for sites where the data only lives in the
DOM (Wix, color-coded badges, etc.). Slow (~3min), needs Chrome up.

```
launchd plist  ─▶  bin/bash run-scan.sh <skill>  ─▶  caffeinate -i  ─▶
  claude --dangerously-skip-permissions --chrome -p "Run puck-finder:<skill>…"
```

**Headless** — for sites with a public JSON API. Fast (~3s), no Chrome, no
LLM session. A standalone TypeScript scanner under `scanners/<name>.ts`
runs under bun.

```
launchd plist  ─▶  bin/bash run-headless-scan.sh <scanner>  ─▶
  bun run scheduler/scanners/<scanner>.ts
```

Prefer headless wherever the source exposes structured data — it's
deterministic, debuggable, and avoids the failure modes of the LLM path.

- `run-scan.sh` is the only entry point. Takes one positional arg: the skill
  slug (e.g. `nepean-hockey-school`).
- Boots Chrome if down, waits 8s for the native-host socket, then runs a
  headless Claude Code session. `--chrome` enables the in-browser MCP tools
  that the scanner skills depend on.
- The prompt instructs Claude to run the skill end-to-end (including the
  POST to `puck-finder-api/scans`) and exit immediately with one line:
  `SCAN_COMPLETE provider=… upserted=… added=… archived=…`
- The puck-finder edge fn now stores a per-scan diff (added /
  status_changed / archived). MC's `/puck-finder?view=scans` tab + the
  per-scan detail page surface that automatically — no separate UI work
  needed per provider.

## Currently scheduled

| Provider                 | Runner   | Time (ET) | Plist label                                              |
|--------------------------|----------|-----------|----------------------------------------------------------|
| nepean-hockey-school     | Chrome   | 03:00     | `co.buyerson.puckfinder-nepean-hockey-school`            |
| perfect-skating-ottawa   | Headless | 03:10     | `co.buyerson.puckfinder-perfect-skating-ottawa`          |
| summit-goaltending       | Headless | 03:20     | `co.buyerson.puckfinder-summit-goaltending`              |

Stagger by ≥10 min so the Chrome ones don't fight over the browser
extension and so logs stay readable.

## Installing the nepean-hockey-school job

```bash
cp scheduler/co.buyerson.puckfinder-nepean-hockey-school.plist \
   ~/Library/LaunchAgents/

launchctl bootstrap "gui/$(id -u)" \
  ~/Library/LaunchAgents/co.buyerson.puckfinder-nepean-hockey-school.plist
```

Check it's registered:

```bash
launchctl print "gui/$(id -u)/co.buyerson.puckfinder-nepean-hockey-school" | head -40
```

Force a manual run (no need to wait for 3am):

```bash
launchctl kickstart -k \
  "gui/$(id -u)/co.buyerson.puckfinder-nepean-hockey-school"
```

Stop / remove:

```bash
launchctl bootout "gui/$(id -u)" \
  ~/Library/LaunchAgents/co.buyerson.puckfinder-nepean-hockey-school.plist
rm ~/Library/LaunchAgents/co.buyerson.puckfinder-nepean-hockey-school.plist
```

## Logs

- `~/Library/Logs/puckfinder-scheduler/<skill>-<timestamp>.log` — one per
  run (full tee of stdout + stderr from the Claude Code session)
- `~/Library/Logs/puckfinder-scheduler/launchd.{out,err}.log` — launchd's
  view of the wrapper (rarely interesting)

## Adding more providers

### Chrome-driven (LLM skill)
Use for providers without a clean JSON API.
1. Confirm the skill runs cleanly when invoked manually
2. Copy `co.buyerson.puckfinder-nepean-hockey-school.plist`, change the
   `Label`, the third `ProgramArguments` entry (skill slug), and the
   `Hour`/`Minute`
3. `cp` + `launchctl bootstrap`

### Headless (preferred where the API exists)
1. Drop `scanners/<provider>.ts` — a bun-runnable file that fetches,
   normalizes, and POSTs to `puck-finder-api/scans`. See
   `scanners/perfect-skating.ts` for the template.
2. Smoke-test: `~/.bun/bin/bun run scheduler/scanners/<provider>.ts`
3. Copy `co.buyerson.puckfinder-perfect-skating-ottawa.plist`, change the
   `Label`, the third `ProgramArguments` entry (scanner name = filename
   without `.ts`), and `Hour`/`Minute`
4. `cp` + `launchctl bootstrap`

Sequencing tip: stagger different providers by at least 10 minutes so
the Chrome-driven ones don't fight over the browser extension and so
log files stay readable.

## Known limitations

- **Mac must be awake at scan time** — accepted for v1. If the Mac was
  asleep, launchd runs the job on next wake.
- **Chrome must be installed** — the wrapper `open -ga`s it; if Chrome is
  uninstalled the run fails fast.
- **`--dangerously-skip-permissions` is by design** — there's no human in
  the loop at 3am. The blast radius is limited to whatever the puck-finder
  skill itself does (browse a public site + POST to one API endpoint we
  own).
- **Single sequential execution** — no concurrency. If a run is still in
  flight when the next one fires (shouldn't happen for an hour-spaced
  cadence), launchd does not start a second copy.
