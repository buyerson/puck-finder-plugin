# puck-finder scheduler

Headless launchd jobs that run scanner skills on a schedule. v1 covers
nepean-hockey-school daily at 03:00 ET; other providers come later via the
same pattern.

## Architecture

```
launchd plist  ─▶  bin/bash run-scan.sh <skill>  ─▶  caffeinate -i  ─▶
  claude --dangerously-skip-permissions --chrome -p "Run puck-finder:<skill>…"
```

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

1. Confirm the skill runs cleanly when invoked manually
2. Copy the plist, change the `Label`, the third `ProgramArguments` entry
   (the skill slug), and the `Hour`/`Minute`
3. `cp` + `launchctl bootstrap` as above

Sequencing tip: stagger different providers by at least 10 minutes so
Chrome / the Claude extension isn't asked to drive two sessions at once.

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
