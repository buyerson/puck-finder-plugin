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
