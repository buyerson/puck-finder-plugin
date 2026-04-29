---
name: amped-sports
description: Check Amped Sports (AMPED Sports Lab & Ice Complex) program availability. Use when the user says "check amped", "amped sports", "amped hockey", or asks about hockey programs at Amped Sports Lab.
---

# Amped Sports Program Checker

Check https://ampedsports.playbookapi.com/programs/register/ for available hockey programs.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Amped Sports registration page.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Amped Sports website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the page requires JavaScript rendering.

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").

## Arena/Location Naming Rules

- Before creating a new arena, check if it already exists by searching the `GET /arenas?q=` endpoint with a partial name match.
- Use the SHORT facility name (e.g. "Fred Barrett Arena", not "Fred G. Barrett Arena"). Do not append neighborhood, city, or rink-pad names to the arena name.
- If the arena already exists under a slightly different name, use the existing arena and add the variant as an alias via `PUT /arenas/:slug` with the `aliases` field, rather than creating a new arena.

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. Navigate to the **category pages directly** (more reliable than expanding sections on the main page):
   - `https://ampedsports.playbookapi.com/programs/register/player_high_performance/` — competitive programs
   - `https://ampedsports.playbookapi.com/programs/register/player_development/` — open/development programs
   - Skip Golf Simulator, Team Training, and Ice Rental categories
3. On each category page, extract the full page text with `document.body.innerText`
4. Parse program blocks from the text (see extraction notes below)
5. For each program, capture:
   - Program name (strip birth years from name — put them in min/max_birth_year fields)
   - Category (High Performance vs Development)
   - Schedule (day/time)
   - Location (if shown)
   - Number of available sessions (e.g., "30 Class Sessions available")
   - Price (if shown)
   - Status

## DOM Extraction Notes

The Playbook API page renders program blocks as text. Each program block contains:
- Program name (bold, with age/birth year info in parentheses)
- Schedule line (e.g., "Tuesdays/Thursdays 4-5pm (April, May, June)")
- Location (e.g., "The AMPED Sports Lab")
- Competitive restriction note (e.g., "*Competitive Players only*")
- Action button ("View Class Sessions" or "View Session Packs")
- Session count (e.g., "48 Class Sessions available")

Extract using `document.body.innerText` — the page structure is flat text, not a structured table. Build one session per program (not per individual class session).

### Source URLs

Use the category page URL as `source_url` for each session:
- High Performance programs: `https://ampedsports.playbookapi.com/programs/register/player_high_performance/`
- Development programs: `https://ampedsports.playbookapi.com/programs/register/player_development/`

### Location Mapping

| Website Name | Arena Name |
|-------------|------------|
| The AMPED Sports Lab | Amped Sports Lab |
| Tony Graham Recreation Complex | Tony Graham Recreation Complex |

## Status Determination

| Status | Indicators |
|--------|------------|
| `available` | Has **"View Class Sessions"** or **"View Session Packs"** button with sessions available |
| `limited` | Shows limited sessions remaining |
| `sold_out` | No sessions available, or shows "Sold Out" |

## Program Categories

**Player High Performance** (Competitive Players Only):
- High Performance age-group programs (U10/U11, U13, U15, Jr/U18)
- High Performance Semi-Private (small group)
- Defence Clinic
- Morning Off-site Skill Development
- March Break / PreTryout Camps (AMPED X FitQuest)

**Player Development** (Open to all skill levels):
- PEP/Skills programs (U10/U13, U15/U18)
- Fundamental Skills (U9/U11)
- Pre Tryout Conditioning Sessions
- Contact Clinic
- PA Day Camp
- Summer Camp
- Rise and Shine (before school)
- Private 1 on 1 Off-Ice Shooting

## Locations

- The AMPED Sports Lab (primary venue)
- Tony Graham Recreation Complex (off-site morning sessions)

## Age/Birth Year Parsing (REQUIRED)

Every session with age info in the program name MUST have `min_birth_year` and `max_birth_year` set. There are two formats to handle:

**Format 1: Explicit birth years in parentheses** — use directly:
- "High Performance U13 (2015-2014)" → min_birth_year: 2014, max_birth_year: 2015
- "PA Day Camp U9-U14 (2012-2018)" → min_birth_year: 2012, max_birth_year: 2018

**Format 2: Only U-age labels, no parentheses** — convert using `birth_year = 2026 - age`:
- "U9/U11 Fundamental Skills" → U9=2017, U11=2015 → min_birth_year: 2015, max_birth_year: 2017
- "U14/U15/U16 Pre Tryout Conditioning Sessions" → U14=2012, U16=2010 → min_birth_year: 2010, max_birth_year: 2012
- "U9/U11/U13 Pre Tryout Conditioning Sessions" → U9=2017, U13=2013 → min_birth_year: 2013, max_birth_year: 2017

**Rules:**
- `min_birth_year` = oldest players (smallest number) = `2026 - largest_U_number`
- `max_birth_year` = youngest players (largest number) = `2026 - smallest_U_number`
- When multiple U-ages are listed (U9/U11/U13), use the outermost: min from largest U, max from smallest U
- Only set null when the program name has NO age or birth year info (e.g., "Private 1 on 1 Off-Ice Shooting", "Rise and Shine")

## Output Format

Organize programs by category:
1. **Player High Performance** - competitive programs
2. **Player Development** - open/development programs

Include for each:
- Program name
- Age group / birth years
- Day/Time
- Location
- Sessions available count
- Price (if shown)
- Status
- Special notes (competitive only, open to all, etc.)

## Data Persistence

After scanning, save results to both local JSON and Supabase.

**CRITICAL:** The `start_date` field MUST be set for sessions to appear in the app. The edge function filters by `start_date >= first_of_month`, so sessions with NULL `start_date` won't show up. Always include `session_date` (ISO date) for each session — the API uses it to set `start_date`. Also include `start_date` and `end_date` explicitly when possible.

### Local JSON Audit Trail

Save to: `data/provider-scans/amped-sports/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "amped-sports",
  "scanned_at": "2026-02-21T14:00:00Z",
  "source_url": "https://ampedsports.playbookapi.com/programs/register/",
  "scan_date_start": "2026-02-21",
  "scan_date_end": "2026-06-30",
  "sessions": [
    {
      "program_name": "High Performance U13 (2015-2014)",
      "session_type": "drop_in",
      "session_date": "2026-02-21",
      "start_date": "2026-02-21",
      "end_date": "2026-06-30",
      "category": "Player High Performance",
      "day_of_week": "Wednesday,Friday,Sunday",
      "start_time": null,
      "location": null,
      "status": "available",
      "notes": "Competitive Players only - 38 Class Sessions available",
      "min_birth_year": 2014,
      "max_birth_year": 2015
    },
    {
      "program_name": "U9/U11 Fundamental Skills",
      "session_type": "drop_in",
      "session_date": "2026-02-21",
      "start_date": "2026-02-21",
      "end_date": "2026-06-30",
      "category": "Player Development",
      "day_of_week": "Saturday,Friday",
      "start_time": null,
      "location": "The AMPED Sports Lab",
      "status": "available",
      "notes": "27 Class Sessions available",
      "min_birth_year": 2015,
      "max_birth_year": 2017
    }
  ],
  "summary": {
    "total": 18,
    "by_status": {
      "available": 18,
      "limited": 0,
      "sold_out": 0
    }
  }
}
```

### Scan Date Window (Required)

- ALWAYS include `scan_date_start` (earliest `session_date` in the scan) and `scan_date_end` (latest `session_date` in the scan) in the payload
- This tells the API to archive any active sessions from this provider within that date range that weren't included in this scan
- This prevents stale/removed sessions from lingering in the database

### Submit to API

After saving the local JSON, submit the scan data to the backend API. ```bash
# Submit + assert: surface unresolved aliases, upsert mismatches, and stale-active drift.
curl -s -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/amped-sports/scan-{YYYY-MM-DD-HHmmss}.json \
  | jq -r '
      .data as $d
      | "✓ upserted=\($d.sessions_upserted)/\($d.sessions_received) | archived=\($d.sessions_archived | length) | stale_active=\($d.stale_active_sessions // 0) | unresolved=\($d.unresolved_locations | length)",
        (if ($d.unresolved_locations | length) > 0 then "  ⚠ unresolved: " + ($d.unresolved_locations | join("; ")) else empty end),
        (if $d.sessions_upserted != $d.sessions_received then "  ⚠ upsert mismatch — investigate" else empty end),
        (if ($d.stale_active_sessions // 0) > 0 then "  ⚠ stale_active=\($d.stale_active_sessions) — auto-archive missed something" else empty end)
    '
```

The API handles:
- Looking up the provider by `provider` slug in the JSON (returns 404 if provider doesn't exist)
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

## Notes

- Powered by Playbook API (playbookapi.com)
- Programs use "Class Sessions" (drop-in/individual) and "Session Packs" (bundled)
- Most High Performance programs are *Competitive Players only*
- Development programs are generally open to all skill levels
- Primary location is The AMPED Sports Lab in Ottawa
- Phone: (613) 822-9000

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Amped Examples |
|------|-----------|----------------|
| `camp` | Multi-day consecutive programs | March Break Camp, PreTryout Camp (AMPED X FitQuest), PA Day Camp, Summer Camp |
| `drop_in` | Single standalone sessions, pay-per-session | Individual "Class Sessions" (View Class Sessions button) |
| `series` | Weekly recurring programs over multiple weeks | "Session Packs" covering multiple weeks, High Performance programs, PEP/Skills series |
| `clinic` | One-time or short special events | Defence Clinic, Contact Clinic, Pre Tryout Conditioning Sessions |
| `ice_rental` | Bookable ice rental time slots (City of Ottawa arenas) | — (not used for Amped Sports) |
| `unknown` | Default when type cannot be determined | — |

**Amped classification rules:**
- Programs with "View Class Sessions" and individual date selection = `drop_in`
- Programs with "View Session Packs" (bundled multi-week) = `series`
- Programs with "Camp" in the name = `camp`
- Programs with "Clinic" in the name = `clinic`
- Rise and Shine (before school, recurring weekly) = `series`
