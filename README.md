# Puck Finder

Scan Ottawa hockey program providers for session availability and sync results to the Puck Finder backend.

## What it does

Scans multiple Ottawa-area hockey and skating program websites using browser automation. Each provider uses a different registration platform (Playbook API, LeagueApps, Uplifter, Shopify, ActiveNet, WordPress, Wix, etc.), so each skill has provider-specific extraction logic. Results are displayed in chat and submitted to the Puck Finder API via curl.

## Providers

| Skill | Provider | Platform |
|-------|----------|----------|
| `nepean-hockey-school` | Nepean Hockey School (James White) | Static site with color-coded availability |
| `amped-sports` | AMPED Sports Lab & Ice Complex | Playbook API |
| `apex-hockey` | Apex Hockey Ottawa | LeagueApps |
| `ashley-holmes-hockey` | Ashley Holmes Training | Uplifter Inc. (KnockoutJS) |
| `next-generation-hockey` | Next Generation Hockey | Wix static site |
| `ottawa-ice-time` | City of Ottawa Last-Minute Ice | ActiveNet REST API |
| `perfect-skating-ottawa` | Perfect Skating Ottawa | Shopify |
| `sensplex` | Sensplex / Ottawa Senators Hockey Programs | WordPress/Elementor + PDF registration |

## Requirements

- **Claude in Chrome extension** must be running (all providers require browser automation)

## Usage

Say any of:
- "check nepean hockey" / "check amped" / "check apex" / etc.
- "scan all providers"
- Or use `/check-nepean`, `/check-amped`, `/check-apex`, etc.

## Data Persistence

Scan results are submitted to the Puck Finder API via curl. The API key is embedded in each skill's persistence instructions.

## Scan Submission Protocol (assertion-on-submit)

Every provider skill that calls `POST /scans` MUST inspect the response and surface anomalies in its return string. The endpoint always returns:

- `sessions_received` — number of sessions in the request body
- `sessions_upserted` — number actually written
- `sessions_archived` — array of sessions auto-archived in the scan window
- `unresolved_locations` — string array of locations that didn't match an arena alias
- `stale_active_sessions` — count of this provider's active sessions whose `start_date` is more than 7 days in the past (signals scan-window mismatch or program-name drift)
- `scan_id` — UUID of the scan record

Each skill's submit code should warn loudly when:

- `unresolved_locations.length > 0` — an arena alias is missing; add it via `PUT /arenas/:slug`
- `sessions_upserted !== sessions_received` — silent dedup or insert error
- `stale_active_sessions > 0` — auto-archive isn't catching something; investigate before the next scan

See `skills/ottawa-ice-time/SKILL.md` for the canonical implementation.
