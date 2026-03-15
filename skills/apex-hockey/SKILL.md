---
name: apex-hockey
description: Check Apex Hockey Ottawa program availability. Use when the user says "check apex", "apex hockey", "apex skating", or asks about hockey programs at Apex Hockey in Ottawa.
---

# Apex Hockey Ottawa Program Checker

Check https://apexhockey.com/canada/ottawa/ for available hockey programs in Ottawa.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Apex Hockey registration page.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Apex Hockey website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the page requires JavaScript rendering and interactive elements.

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
2. Navigate to https://apexhockey.com/canada/ottawa/?la-state=OPEN_REGISTRATIONS_AND_UPCOMING
3. Click on the **REGISTRATIONS** tab to view available programs
4. The page shows a table with filters: Day of the Week, Location, Season
5. **Phase 1 - Scan table:** Scroll through the entire table, capturing ALL rows with:
   - Program name (exact text as displayed)
   - Program Start Date
   - Location/Venue
   - Season (Winter, Spring, Summer)
   - Time
   - **Status** (available, limited, waitlist, sold_out)
6. **Phase 2 - Capture event URLs:** See "Capturing Event URLs" section below. This is REQUIRED.
7. **Phase 3 - Enrich camp details:** See "Camp Detail Page Enrichment" section below. This is REQUIRED for all `/camps/` URLs.
8. **Phase 4 - Save data:** Every session MUST have a `source_url` field before saving.

## Status Determination

Determine status for each program based on these indicators:

| Status | Indicators |
|--------|------------|
| `available` | Has **"SIGN UP"** button, normal registration open |
| `limited` | Shows limited spots available (e.g., "X spots left") |
| `waitlist` | Program name contains "Wait List" or "Waitlist" |
| `sold_out` | Shows **"SOLD OUT"**, "Registration Closed", or no sign up option |

## Capturing Event URLs (REQUIRED)

Every session in the output MUST have a `source_url` pointing to its specific LeagueApps booking page. This is the most important field — it lets users go directly to the page where they can register.

### How it works

The registration table is rendered inside a **LeagueApps iframe**. Each program name is a clickable link that opens a **new browser tab** with the event detail page on LeagueApps.

**Key insight:** Multiple rows in the table share the same program (e.g., "Tier One Winter 2026 Hockey Classes (Bell Centennial Arena)" appears for many dates — Feb 6, Feb 27, Mar 6, etc.). All rows with the **same program name** share the **same LeagueApps URL**. You only need to click each unique program name once.

### URL patterns

LeagueApps URLs follow this format: `https://apexhockeycanada.leagueapps.com/{type}/{id}-{slug}`

| Program type | URL path | Example |
|-------------|----------|---------|
| Classes (Tier One, Close Quarter Battle, Performance Skating) | `/classes/{id}-{slug}` | `https://apexhockeycanada.leagueapps.com/classes/4794195-tier-one-winter-2026-hockey-classes-bell-centennial-arena` |
| Camps (Summer camps, March Break, Tryout Prep) | `/camps/{id}-{slug}` | `https://apexhockeycanada.leagueapps.com/camps/4802109-girls-hockey-tryout-prep-camp-ottawa-on` |
| Events (Wait lists, clinics) | `/events/{id}-{slug}` | `https://apexhockeycanada.leagueapps.com/events/4129129-general-interest-wait-list---ottawa` |

### Step-by-step URL capture process

1. **Build unique program list:** After scanning the table (Phase 1), compile a list of unique program names. There are typically ~20-30 unique programs across ~77 session rows.

2. **Click each unique program name once:**
   - Click the program name link in the table row
   - A new tab opens with the LeagueApps event page
   - Call `tabs_context_mcp` to get the new tab's URL
   - Record the mapping: `program_name → LeagueApps URL`
   - Close the new tab (navigate back or close it) to avoid tab accumulation
   - Scroll back to where you were in the table if needed

3. **Apply URLs to all sessions:** After collecting all unique URLs, assign the `source_url` to every session row based on its program name.

### Tips for efficiency

- Process programs in the order they appear while scrolling through the table
- You can click a program name, capture the URL from `tabs_context_mcp`, and close the tab all in quick succession
- If a program name appears multiple times in the table, only click it the FIRST time
- Keep a running map of `{ program_name: source_url }` as you go

### Fallback

If clicking a program name fails to open a new tab for any reason, use the registration page URL as fallback:
`https://apexhockey.com/canada/ottawa/?la-state=OPEN_REGISTRATIONS_AND_UPCOMING#register`

## Camp Detail Page Enrichment (REQUIRED)

The registration table only provides `session_date` and time for each row. For **camp sessions** (URLs with `/camps/` path), critical fields are MISSING from the table and must be gathered from the LeagueApps detail page:

- **end_date** (camps span multiple days)
- **price** (Camper Fees)
- **min_birth_year / max_birth_year** (from age requirements)

### What the detail page shows

Each LeagueApps camp detail page contains these fields in the sidebar:

| Field | Example | Maps to |
|-------|---------|---------|
| Season | Winter 2026 | `season` |
| Starts | Mon, Mar 16, 2026 | `start_date` (for the program overall) |
| Ends | Fri, Mar 20, 2026 | Used to calculate `end_date` |
| Location | Fred Barrett Arena | `location` |
| Minimum age | 10 years old | Used for `max_birth_year` |
| Maximum age | 13 years old | Used for `min_birth_year` |
| Age as of | Dec 31 '26 | Reference date for birth year calc |
| Camper Fees | $615.00 | `price` |

### Step-by-step enrichment process

1. **Identify unique camp URLs:** From Phase 2 URL capture, collect all unique URLs with `/camps/` in the path. There are typically 10-16 unique camp programs.

2. **Visit each camp detail page:** Navigate to each unique `/camps/` URL and extract:
   - `Starts` and `Ends` dates → calculate duration in days
   - `Camper Fees` → `price`
   - `Minimum age`, `Maximum age`, `Age as of` → birth years

3. **Calculate birth years from ages:**
   ```
   age_as_of_year = year from "Age as of" field (e.g., 2026)
   min_birth_year = age_as_of_year - maximum_age
   max_birth_year = age_as_of_year - minimum_age
   ```
   Example: Min age 10, Max age 13, Age as of Dec 31 '26:
   - `min_birth_year` = 2026 - 13 = 2013
   - `max_birth_year` = 2026 - 10 = 2016

4. **Calculate end_date for each session row:**
   - For camps where all rows share the same date range (e.g., March Break camp Mar 16-20), set `end_date` directly from the detail page `Ends` field
   - For camps with multiple session_dates in the table (different weeks), calculate: `end_date = session_date + (program_duration_days - 1)`
   - Duration = `Ends` date - `Starts` date from the detail page

5. **Apply enrichment to all matching sessions:** Every session row sharing the same `source_url` gets the same `price`, `min_birth_year`, `max_birth_year`. Each row's `end_date` is calculated individually based on its own `session_date` + duration.

### Performance Skating Exception

**IMPORTANT:** "Performance Skating" programs with `/camps/` URLs may actually be weekly `series`, not camps. Check the date range: if `Starts` to `Ends` spans many weeks (e.g., Apr 4 - Jun 13) with weekly Saturday sessions, classify as `session_type: "series"` instead of `camp`. The LeagueApps URL path is misleading in this case.

### Example enrichment data

```json
{
  "program_name": "March Break Hockey Camp 2026 (Fred Barrett Arena)",
  "session_type": "camp",
  "session_date": "2026-03-16",
  "start_date": "2026-03-16",
  "end_date": "2026-03-20",
  "price": 615.00,
  "min_birth_year": 2013,
  "max_birth_year": 2016,
  "source_url": "https://apexhockeycanada.leagueapps.com/camps/4795637-..."
}
```

## Program Types

**Regular Classes:**
- Tier One Hockey Classes - Skills development sessions
- Close Quarter Battle Program - Battle/compete training
- Power Skating classes

**Camps:**
- March Break camps
- Summer hockey camps
- Spring Break camps
- Defense Hockey camps

**Special Programs:**
- General Interest Wait List - Email notification list for upcoming programs (status: waitlist)

## Locations

Programs run at multiple Ottawa venues:
- Fred Barrett Arena
- Bell Centennial Arena
- Tony Graham Recreation Complex
- Richcraft Sensplex
- Jim Durrell Recreation Centre
- Minto Recreation Complex
- Nepean Sportsplex
- John G. Mlacak Community Centre
- Walter Baker Arena

## Output Format

Organize programs by status:
1. **Available** (status: available or limited)
2. **Waitlist** (status: waitlist)
3. **Sold Out** (status: sold_out)

Include for each:
- Program name
- Date
- Time
- Location/Venue
- Season
- Status
- Source URL (LeagueApps link)
- Age requirements (if available from detail page)
- Price (if available)

**Example output:**
```
## Available Programs

### Classes
- **Tier One Winter 2026 Hockey Classes (Bell Centennial Arena)**
  - Friday 4:00-5:00pm | Jan 23, 2026 | status: available
  - Book: https://apexhockeycanada.leagueapps.com/classes/4794195-tier-one-winter-2026-hockey-classes-bell-centennial-arena

### Camps
- **Girls Hockey Tryout Prep Camp (Ottawa, ON)**
  - Apr 4, 2026 | Richcraft Sensplex | status: available
  - Book: https://apexhockeycanada.leagueapps.com/camps/4802109-girls-hockey-tryout-prep-camp-ottawa-on

### Sold Out
- **Close Quarter Battle Program Winter 2026 (Richcraft Sensplex)**
  - Thursday 7:00am | status: sold_out
  - Page: https://apexhockeycanada.leagueapps.com/classes/XXXXXXX-close-quarter-battle-program-winter-2026-richcraft-sensplex

### Waitlist
- **General Interest Wait List - Ottawa**
  - status: waitlist (notification list for upcoming programs)
  - Page: https://apexhockeycanada.leagueapps.com/events/4129129-general-interest-wait-list---ottawa
```

## Data Persistence

After scanning, save results to both local JSON and Supabase.

### Local JSON Audit Trail

Save to: `data/provider-scans/apex-hockey/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "apex-hockey",
  "scanned_at": "2026-01-20T10:30:00Z",
  "source_url": "https://apexhockey.com/canada/ottawa/?la-state=OPEN_REGISTRATIONS_AND_UPCOMING",
  "sessions": [
    {
      "program_name": "Tier One Winter 2026 Hockey Classes (Bell Centennial Arena)",
      "session_type": "drop_in",
      "session_date": "2026-02-06",
      "start_time": "16:00",
      "end_time": "17:00",
      "location": "Bell Centennial Arena",
      "season": "Winter",
      "status": "available",
      "source_url": "https://apexhockeycanada.leagueapps.com/classes/4794195-tier-one-winter-2026-hockey-classes-bell-centennial-arena",
      "min_birth_year": null,
      "max_birth_year": null,
      "price": null,
      "notes": null
    },
    {
      "program_name": "Girls Hockey Tryout Prep Camp (Ottawa, ON)",
      "session_type": "camp",
      "session_date": "2026-04-04",
      "start_date": "2026-04-04",
      "end_date": "2026-04-05",
      "start_time": null,
      "end_time": null,
      "location": "Richcraft Sensplex",
      "season": "Spring",
      "status": "available",
      "source_url": "https://apexhockeycanada.leagueapps.com/camps/4802109-girls-hockey-tryout-prep-camp-ottawa-on",
      "min_birth_year": 2011,
      "max_birth_year": 2016,
      "price": 215.00,
      "notes": null
    }
  ],
  "summary": {
    "total": 75,
    "by_status": {
      "available": 55,
      "limited": 0,
      "waitlist": 1,
      "sold_out": 19
    }
  }
}
```

**IMPORTANT:** Every session object MUST include a `source_url` field with the direct LeagueApps booking link. Do NOT save the JSON without `source_url` on every session. Sessions sharing the same program name will have the same `source_url`.

### Submit to API

After saving the local JSON, submit the scan data to the backend API. ```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/apex-hockey/scan-{YYYY-MM-DD-HHmmss}.json
```

The API handles:
- Looking up the provider by `provider` slug in the JSON
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

## Age Information

Apex Hockey shows age requirements on the event detail page:
- Minimum age (e.g., "6 years old")
- Maximum age (e.g., "14 years old")
- Age as of date (e.g., "Jan 1 '26")

Convert to birth years using the "Age as of" date:
- If age as of Jan 1, 2026:
  - Minimum age 6 → max_birth_year: 2020 (2026 - 6)
  - Maximum age 14 → min_birth_year: 2012 (2026 - 14)

## Notes

- Programs are listed as individual dates, not recurring sessions (is_recurring = false)
- The site uses LeagueApps for registration backend
- Click "SIGN UP" button or program name to access the LeagueApps event page
- "General Interest Wait List" is always status: waitlist
- "SOLD OUT" in program display means status: sold_out

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Apex Examples |
|------|-----------|---------------|
| `camp` | Multi-day consecutive programs | March Break camps, Summer camps, Tryout Prep camps, Defense camps |
| `drop_in` | Single standalone sessions, pay-per-session | Individual class dates (Tier One single dates, CQB single dates) |
| `series` | Weekly recurring programs over multiple weeks | Full class registrations spanning multiple weeks |
| `clinic` | One-time or short special events | Body Contact Clinic |
| `ice_rental` | Bookable ice rental time slots (City of Ottawa arenas) | — (not used for Apex Hockey) |
| `unknown` | Default when type cannot be determined | General Interest Wait List |

**Apex classification rules:**
- **Name override (highest priority):** If the program name contains "Clinic" (e.g., "Body Contact Clinic"), classify as `clinic` regardless of URL path.
- LeagueApps URL path `/camps/` = `camp` (BUT see exceptions below)
- LeagueApps URL path `/classes/` with individual date rows = `drop_in`
- LeagueApps URL path `/events/` (Wait List) = `unknown`
- If a class registration covers the full season (not individual dates), use `series`
- **Exception:** `/camps/` URL with weekly sessions spanning many weeks (e.g., Performance Skating Spring - Saturdays Apr 4 to Jun 13) = `series`, not `camp`. Check the Starts/Ends range on the detail page during Phase 3 enrichment.
