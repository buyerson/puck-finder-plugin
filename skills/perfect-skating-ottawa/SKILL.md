---
name: perfect-skating-ottawa
description: Check Perfect Skating Ottawa program availability. Use when the user says "check perfect skating", "perfect skating ottawa", or asks about skating programs at Perfect Skating.
---

# Perfect Skating Ottawa Program Checker

Check https://ottawa.perfectskating.ca/collections/all for available skating programs.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Perfect Skating website.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Perfect Skating website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the page requires JavaScript rendering and interactive elements.

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").
6. Use the exact program name from the website header. Do not substitute "Small Area Movement Program" for "Perfect Skating Program" or vice versa — use whatever the site says.

## Arena/Location Naming Rules

- Before creating a new arena, check if it already exists by searching the `GET /arenas?q=` endpoint with a partial name match.
- Use the SHORT facility name (e.g. "Fred Barrett Arena", not "Fred G. Barrett Arena"). Do not append neighborhood, city, or rink-pad names to the arena name.
- If the arena already exists under a slightly different name, use the existing arena and add the variant as an alias via `PUT /arenas/:slug` with the `aliases` field, rather than creating a new arena.

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. Navigate to https://ottawa.perfectskating.ca/collections/all
3. The page displays "PRODUCTS" with a grid of program cards
4. Note the total product count shown (e.g., "14 PRODUCTS")
5. Scroll through the page to capture ALL programs
6. For each program, determine its **status** based on visual indicators
7. Note program details:
   - Program name
   - Season (e.g., "Summer 2026", "Spring 2026", "Late Winter 2026")
   - Price
   - **Status** (available, limited, sold_out)

## Status Determination

Determine status for each program based on these indicators:

| Status | Indicators |
|--------|------------|
| `available` | No "Sold out" badge, can click through to purchase |
| `limited` | Shows "Limited spots" or similar warning (if displayed) |
| `sold_out` | Shows **"Sold out"** badge on the product card |

## Getting Program Details

For programs you want more details on:
1. Click on the program card to open the detail page
2. The detail page shows:
   - **Price**: e.g., "$700.00 CAD"
   - **Time & Location** dropdown: Multiple session options
   - **Program Start Date**: e.g., "THE WEEK OF APRIL 20th"
   - **Program Description**: Features and format

3. The Time & Location dropdown shows all available sessions:
   - Format: "Location (DAY) / Time (Start Date)"
   - Example: "Carleton U (MON) / 6:30am (Apr. 20th)"

## Program Types

**Perfect Skating Program:**
- Core skating program
- 10-week format
- On-ice movement sessions with progression tracking

**Small Area Movement (SAM) Program:**
- Defence-focused or Forwards-focused versions
- 5-week format available
- Focus on agility and quick movements

**200FT Skating Program:**
- Linear Front Stride & Linear Crossovers
- 1-week or 5-week formats

**Hybrid Programs:**
- Combination of Perfect Skating and SAM

**Specialty Clinics:**
- Shorter format, lower cost (~$60)
- Specific skill focus

## Seasons

Programs are organized by season:
- **Late Winter 2026**: Feb-Mar timeframe
- **Spring 2026**: Apr-May timeframe (starts week of Apr 20th)
- **Summer 2026**: Jun-Aug timeframe

## Locations

Programs run at multiple Ottawa venues:
- Carleton U (Carleton University)
- Bell Sensplex
- Richcraft Sensplex
- Ray Friel
- Minto Barrhaven
- Walter Baker

## Filters Available

The page has filter dropdowns:
- **Availability**: Filter by available/sold out
- **Product type**: Filter by program type
- **Rink Location**: Filter by venue
- **Season**: Filter by season

## Output Format

Organize programs by status:
1. **Available** (status: available or limited)
2. **Sold Out** (status: sold_out)

Include for each:
- Program name
- Season
- Price
- Status
- Available locations/times (from detail page if checked)
- Start date

**Example output:**
```
## Available Programs

### Spring 2026 (starts week of Apr 20)
- **Perfect Skating Program** - $700 CAD | status: available
  - Multiple locations: Carleton U, Bell Sensplex, Ray Friel, Minto Barrhaven, Walter Baker
  - Days: Mon-Thu, various times (6:15am-4:30pm)

- **Small Area Movement Program (Defence)** - $700 CAD | status: available
- **Small Area Movement Program (Forwards)** - $700 CAD | status: available

### Summer 2026
- **5 Week Perfect Skating Program** - $700 CAD | status: available
- **1-Week 200FT Skating Program** - $700 CAD | status: available
- **1-Week Hybrid PS and SAM Program** - $700 CAD | status: available

### Sold Out
- **Perfect Skating Program - Late Winter 2026** | status: sold_out
```

## Data Persistence

After scanning, save results to both local JSON and Supabase.

**CRITICAL:** The `start_date` field MUST be set for sessions to appear in the app. The edge function filters by `start_date >= first_of_month`, so sessions with NULL `start_date` won't show up. Always include `session_date` (ISO date) for each session — the API uses it to set `start_date`. Also include `start_date` and `end_date` explicitly.

### Local JSON Audit Trail

Save to: `data/provider-scans/perfect-skating/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "perfect-skating-ottawa",
  "scanned_at": "2026-01-20T10:30:00Z",
  "source_url": "https://ottawa.perfectskating.ca/collections/all",
  "sessions": [
    {
      "program_name": "Perfect Skating Program - Spring 2026",
      "session_type": "series",
      "season": "Spring 2026",
      "price": 700.00,
      "start_date": "2026-04-20",
      "locations": ["Carleton U", "Bell Sensplex", "Ray Friel"],
      "status": "available"
    },
    {
      "program_name": "Perfect Skating Program - Late Winter 2026",
      "session_type": "series",
      "season": "Late Winter 2026",
      "status": "sold_out"
    }
  ],
  "summary": {
    "total": 14,
    "by_status": {
      "available": 12,
      "limited": 0,
      "sold_out": 2
    }
  }
}
```

### Submit to API

After saving the local JSON, submit the scan data to the backend API. ```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/perfect-skating/scan-{YYYY-MM-DD-HHmmss}.json
```

The API handles:
- Looking up the provider by `provider` slug in the JSON
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

### Date Calculation

For programs with "X-week format":
- `start_date` = stated start date (e.g., Apr 20, 2026)
- `end_date` = start_date + (weeks * 7 days)

Examples:
- 10-week program starting Apr 20 → end_date = Jun 29
- 5-week program starting Apr 20 → end_date = May 25
- 1-week program → end_date = start_date + 7 days

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Perfect Skating Examples |
|------|-----------|------------------------|
| `camp` | Multi-day consecutive programs | 1-Week programs (200FT Skating, Hybrid PS and SAM) — daily sessions over 1 week |
| `drop_in` | Single standalone sessions, pay-per-session | — |
| `series` | Weekly recurring programs over multiple weeks | 10-week Perfect Skating Program, 5-week SAM Program, 5-week 200FT Program |
| `clinic` | One-time or short special events | Specialty Clinics (~$60, single session) |
| `ice_rental` | Bookable ice rental time slots (City of Ottawa arenas) | — (not used for Perfect Skating) |
| `unknown` | Default when type cannot be determined | — |

**Perfect Skating classification rules:**
- "10-week" or "5-week" programs = `series`
- "1-Week" programs (daily for a week) = `camp`
- Specialty Clinics (low cost, single event) = `clinic`
