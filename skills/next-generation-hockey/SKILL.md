---
name: next-generation-hockey
description: Check Next Generation Hockey program availability. Use when the user says "check nextgen", "nextgen hockey", "next generation hockey", or asks about hockey programs at Next Generation Hockey in Ottawa.
---

# Next Generation Hockey Program Checker

Check https://www.nextgeneration-hky.com for available hockey programs in Ottawa.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Next Generation Hockey website.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Next Generation Hockey website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the page content must be read from the browser.

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").
6. For camps, name them as the series (e.g. "March Break Camp"), not with the specific date in the name. Do NOT include day-of-week or date in program_name.

## Arena/Location Naming Rules

- Before creating a new arena, check if it already exists by searching the `GET /arenas?q=` endpoint with a partial name match.
- Use the SHORT facility name (e.g. "Fred Barrett Arena", not "Fred G. Barrett Arena"). Do not append neighborhood, city, or rink-pad names to the arena name.
- If the arena already exists under a slightly different name, use the existing arena and add the variant as an alias via `PUT /arenas/:slug` with the `aliases` field, rather than creating a new arena.

## Pages to Scan (Hockey Only, Ottawa Only)

Scan these 7 program pages sequentially. Do NOT scan ringette pages or Renfrew-location pages.

| Page | URL | Session Type |
|------|-----|-------------|
| Weekly Summer Camps | `https://www.nextgeneration-hky.com/week-long` | `camp` |
| Pucks & Battle Camps | `https://www.nextgeneration-hky.com/Pucks-and-Battle-Camp` | `camp` |
| Elite D-Camp | `https://www.nextgeneration-hky.com/Elite_D_Camp` | `camp` |
| Elite F-Camp | `https://www.nextgeneration-hky.com/Elite_F_Camp` | `camp` |
| Spring 4v4 | `https://www.nextgeneration-hky.com/hockey4v4` | `series` |
| Complete Player Development | `https://www.nextgeneration-hky.com/Completeplayerdevelopment` | `series` |
| March Break, Holiday & PD Camps | `https://www.nextgeneration-hky.com/SpecialtyCamps` | `camp` (March Break) / `drop_in` (PD Days) |

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. **Create a new tab** with `mcp__claude-in-chrome__tabs_create_mcp`
3. **Navigate to each program page** sequentially
4. **Extract text content** from each page using `mcp__claude-in-chrome__get_page_text` or `mcp__claude-in-chrome__javascript_tool`
5. **Parse program details**: program name, dates, times, location, cost, age/who, status
6. **For the 4v4 page**: The schedule is in an IMAGE, not HTML. Take a screenshot with `mcp__claude-in-chrome__computer` (action: screenshot) and read the schedule from the image. Also check surrounding text.
7. **Build session objects** for each program offering (one per time slot)
8. **Filter**: Only include sessions with dates >= today (2026-02-22)
9. **Save local JSON** and **submit to API**

## Data Extraction

Each program page contains details embedded directly in the HTML/text (this is a Wix-hosted static site). Look for:

- **Dates**: "JULY 6-10", "AUGUST 4-7", "Sundays July 5, 12, 19, 26"
- **Times**: "12:15 - 2:15pm", "2:15 - 4:15pm", "8:15am-10:15am"
- **Location**: "Cardel Recreation Complex (1500 Shea Rd)", "Walter Baker (100 Malvern Dr)", "Carleton U"
- **Cost**: "$350+HST", "$475+HST", "$399+HST"
- **Who/Age**: "Co-ed Program", "2006-2017 competitive players", "2021-2019 born players"
- **Status**: "SOLD OUT" text appears inline next to specific time slots

### Multiple Time Slots Per Camp Week

Camp pages often list multiple time slots per week, e.g.:
- "MORNING #1: 8:15-10:15am"
- "MORNING #2: 10:15-12:15pm"
- "AFTERNOON: 12:15-2:15pm"

Create a **separate session entry** for each time slot. Status can vary per slot (e.g., Morning #2 sold out but others available).

## Status Determination

| Status | Indicator |
|--------|-----------|
| `available` | No "SOLD OUT" text near the session, registration link present |
| `sold_out` | Red "SOLD OUT" text next to a specific time slot |
| `limited` | Not typically shown on this site; default to `available` |
| `waitlist` | Not typically shown; default to `available` |

## Session Type Classification

| Type | Programs |
|------|----------|
| `camp` | Weekly Summer Camps, Pucks & Battle Camp, Elite D-Camp, Elite F-Camp, March Break Camp |
| `series` | Spring 4v4 (multi-week league), Complete Player Development (multi-week program) |
| `drop_in` | PD Day / Holiday individual day sessions |
| `clinic` | — (none currently) |
| `unknown` | Default when type cannot be determined |

## Location Mapping

Map site text to standardized Puck Finder location names:

| Site Text | Puck Finder Location |
|-----------|---------------------|
| Cardel Recreation Complex / Cardel Rec Complex / Cardel | Cardel Recreation Complex |
| Walter Baker | Walter Baker Sports Centre |
| Carleton U / Carleton University | Carleton University Ice House |
| Kanata Sensplex | Bell Sensplex |
| Kinburn Sensplex | Bell Sensplex |
| Cavanagh Sensplex | Bell Sensplex |
| Tony Graham | Tony Graham Recreation Complex |

## Birth Year Parsing

- "2006-2017 competitive players" → `min_birth_year: 2006`, `max_birth_year: 2017`
- "2021-2019 born players" → `min_birth_year: 2019`, `max_birth_year: 2021` (lower year is always min)
- "Co-ed Program" / "All players welcome" → `null` for both
- If only one year range given, sort so the earlier year is `min_birth_year`

## Price Parsing

Prices appear as "$350+HST", "$475+HST", etc. Store the pre-tax price as a float (e.g., `350.0`). Strip the "+HST" notation.

## Registration URLs

Use the **program page URL** as `source_url` (e.g., `https://www.nextgeneration-hky.com/week-long`), not the cart/registration link. Cart links go to `cart.nextgeneration-hky.com` with product codes that may change.

## Output Format

Organize programs by status:
1. **Available** (status: available)
2. **Sold Out** (status: sold_out)

Include for each:
- Program name
- Dates
- Time
- Location
- Status
- Price
- Age/birth year info (if available)
- Source URL

**Example output:**
```
## Available Programs

### Camps
- **Weekly Summer Camp - July 6-10 (Morning #1)**
  - 8:15am-10:15am | Cardel Recreation Complex | $350+HST
  - Ages: All players welcome
  - Page: https://www.nextgeneration-hky.com/week-long

### Series
- **Spring 4v4 League**
  - Sundays | Walter Baker Sports Centre | $399+HST
  - Ages: 2006-2017 competitive players
  - Page: https://www.nextgeneration-hky.com/hockey4v4

## Sold Out
- **Weekly Summer Camp - July 6-10 (Morning #2)**
  - 10:15am-12:15pm | Cardel Recreation Complex | $350+HST
  - Page: https://www.nextgeneration-hky.com/week-long
```

## Data Persistence

After scanning, save results to both local JSON and Supabase.

### CRITICAL: session_date / start_date Required

The backend API filters sessions by `start_date >= first_of_month`. Sessions with NULL `start_date` are **invisible** to the frontend. Every session object MUST include:
- `session_date` (ISO date string like "2026-07-06")
- `start_date` (same as session_date for single-day; first day for multi-day)
- `end_date` (same as start_date for single-day; last day for multi-day)

### Local JSON Audit Trail

Save to: `data/provider-scans/next-generation-hockey/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "next-generation-hockey",
  "scanned_at": "2026-02-22T10:30:00Z",
  "source_url": "https://www.nextgeneration-hky.com",
  "sessions": [
    {
      "program_name": "Weekly Summer Camp - July 6-10 (Morning #1)",
      "session_type": "camp",
      "session_date": "2026-07-06",
      "start_date": "2026-07-06",
      "end_date": "2026-07-10",
      "day_of_week": "Monday,Tuesday,Wednesday,Thursday,Friday",
      "start_time": "08:15",
      "end_time": "10:15",
      "location": "Cardel Recreation Complex",
      "status": "available",
      "source_url": "https://www.nextgeneration-hky.com/week-long",
      "notes": "Co-ed Program. 2 hours on ice daily.",
      "min_birth_year": null,
      "max_birth_year": null,
      "price": 350.0
    }
  ],
  "summary": {
    "total": 25,
    "by_status": {
      "available": 20,
      "sold_out": 5,
      "limited": 0,
      "waitlist": 0
    }
  }
}
```

### Submit to API

After saving the local JSON, submit the scan data to the backend API. ```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/next-generation-hockey/scan-{YYYY-MM-DD-HHmmss}.json
```

The API handles:
- Looking up the provider by `provider` slug in the JSON
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

## Notes

- This is a Wix-hosted static content site — no APIs, no iframes, no dynamic rendering
- Each program page has its own URL with details in the HTML/text
- The 4v4 schedule is in an IMAGE (not HTML table) — must use screenshot to read it
- Only include hockey programs (no ringette)
- Only include Ottawa-area locations (no Renfrew)
- Only include sessions with dates >= today
- DB enum for status: `available`, `limited`, `waitlist`, `sold_out` (NOT `upcoming`)
- DB enum for session_type: `camp`, `drop_in`, `series`, `clinic`, `ice_rental`, `unknown`
