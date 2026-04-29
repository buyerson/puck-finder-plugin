---
name: sensplex
description: Check Sensplex (Ottawa Senators Hockey Programs / OSHP) program availability. Use when the user says "check sensplex", "sensplex hockey", "sens hockey programs", "oshp", or asks about hockey programs at Sensplex.
---

# Sensplex Program Checker

Check https://sensplex.ca/programs/#youth-hockey-programs for available Ottawa Senators Hockey Programs (OSHP).

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Sensplex website.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Sensplex website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the page requires JavaScript rendering (Elementor/WordPress).

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").
6. Use the shortest official program name (e.g. "Goalie Academy", not "Goalie Academy powered by the Goalie Performance Centre") unless the full name is how the program is listed on the registration page.

## Arena/Location Naming Rules

- Before creating a new arena, check if it already exists by searching the `GET /arenas?q=` endpoint with a partial name match.
- Use the SHORT facility name (e.g. "Fred Barrett Arena", not "Fred G. Barrett Arena"). Do not append neighborhood, city, or rink-pad names to the arena name.
- If the arena already exists under a slightly different name, use the existing arena and add the variant as an alias via `PUT /arenas/:slug` with the `aliases` field, rather than creating a new arena.

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. Create a new tab and navigate to `https://sensplex.ca/programs/#youth-hockey-programs`
3. Wait for page to load (3 seconds)
4. Use JavaScript to extract all youth hockey programs from the page DOM

### JavaScript Extraction Strategy

The page is built with WordPress/Elementor. Programs are structured as:
- `<h1>` tags for major sections ("Youth Hockey Programs", "Adult Hockey Programs")
- `<h2>` tags for categories ("Featured & Specialty Programs", "Introductory Programs", "Recreational Programs", "Competitive Programs")
- `<h3>` tags for individual program names
- `<p>` tags containing "Next Session:" or "Next Camp:" with date range info
- `<a>` tags with "REGISTER HERE", "BOOK NOW", or "MORE INFORMATION" text linking to PDF flyers or external sites

**Extract using this approach:**

```javascript
const body = document.querySelector('.entry-content') || document.body;
let category = '', programName = '';
const programs = [];
let currentProg = null;

for (const el of body.querySelectorAll('h1, h2, h3, p, a')) {
  const tag = el.tagName, text = el.textContent.trim();

  if (tag === 'H1' && text.includes('Youth Hockey')) category = 'Youth Hockey Programs';
  else if (tag === 'H1' && text.includes('Adult Hockey')) break; // Stop at adult programs
  else if (tag === 'H2') category = text;
  else if (tag === 'H3') {
    if (currentProg) programs.push(currentProg);
    currentProg = { name: text, category, session: '', links: [] };
  }
  else if (currentProg && tag === 'P' && text.match(/^Next (Session|Camp):/i)) {
    currentProg.session = text;
  }
  else if (currentProg && tag === 'A' && text.match(/^(REGISTER HERE|BOOK NOW|MORE INFORMATION)$/i)) {
    if (!currentProg.links.find(l => l.href === el.href)) {
      currentProg.links.push({ text: text, href: el.href });
    }
  }
}
if (currentProg) programs.push(currentProg);
```

**Important:** Stop extracting when you hit the "Adult Hockey Programs" `<h1>` heading. We only want youth programs.

5. **Filter out duplicates.** Some programs appear in both "Featured & Specialty" and their actual category (e.g., "Hands HQ" appears under both Featured and Recreational). Keep only the version from the more specific category (Introductory, Recreational, or Competitive). If a program only appears under Featured & Specialty, keep it there.

6. For each program, determine:
   - Program name
   - Category
   - Session date range (from "Next Session:" text)
   - Registration PDF URL (from REGISTER HERE link)
   - Location (if mentioned in session text, e.g., "Richcraft Sensplex Only", "Bell Sensplex")
   - Status

## Status Determination

| Status | Indicators |
|--------|------------|
| `available` | Has a REGISTER HERE or BOOK NOW link (even if date is TBA) |
| `limited` | Has limited availability indicated |
| `waitlist` | Has a waitlist |
| `sold_out` | Program listing removed or link removed (unlikely with static page) |

**Note:** The database enum only supports: `available`, `limited`, `waitlist`, `sold_out`. Do NOT use `upcoming` as a status value.

Since this is a static WordPress page with PDF-based registration, there are **no live availability indicators** (no spot counts, no SOLD OUT badges). All listed programs with registration links are assumed `available`.

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Sensplex Examples |
|------|-----------|-------------------|
| `camp` | Multi-day consecutive programs | PD Day Hockey Camps |
| `drop_in` | Single standalone sessions, pay-per-session | Pop Up Clinics, Sunrise Skills drop-in |
| `series` | Weekly recurring programs over multiple weeks | Hands HQ (11 wks), IP Fundamentals (10 wks), Performance & Power Skating, Complete Player Development, Intro 2 Hockey, Essential Defensive Skills, Shooting & Puck Control, Little Sens Selects, Semi-Private Lessons, Goalie Academy |
| `clinic` | One-time or short special events (1-4 sessions) | Angling & Checking Clinic (4 sessions) |
| `ice_rental` | Bookable ice rental time slots (City of Ottawa arenas) | — (not used for Sensplex) |
| `unknown` | Default when type cannot be determined | — |

**Sensplex classification rules:**
- Most programs are `series` (weekly sessions over 6-12 weeks)
- PD Day Hockey Camps = `camp` (full-day consecutive)
- Pop Up Clinics = `clinic` (single standalone sessions)
- Angling & Checking Clinic (4 sessions at Bell) = `clinic`
- Angling & Checking Clinic (10 sessions at Richcraft spring) = `series`
- Sunrise Skills with drop-in pricing = `series` (the program itself is recurring)

## Youth Program Categories

### Featured & Specialty Programs
- 2026 Pop Up Clinics
- PD Day Hockey Camps (Full-day)

### Introductory Programs
- Learn & Play Hockey Development Program (U7-U15)
- Sparty Learn 2 Skate
- Intro 2 Hockey

### Recreational Programs
- Hands HQ
- IP Fundamental Skills
- Essential Defensive Skills
- Shooting & Puck Control
- Performance & Power Skating
- Weekly Skills / Complete Player Development
- Goalie Academy (powered by Goalie Performance Centre)
- Sunrise Skills & Tactics

### Competitive Programs
- Angling & Checking Clinic (born 2012-2015)
- Semi-Private Lessons
- Little Sens Selects (born 2017-2020)

## Locations

Programs run at three Sensplex facilities:
- **Bell Sensplex** (primary)
- **Richcraft Sensplex**
- **Jack Charron Arena** (less common)

Some programs are location-specific (noted in session text like "Richcraft Sensplex Only").

## Registration Model

Sensplex uses **PDF flyers** for registration, not an online registration system. Each program's "REGISTER HERE" button links to a PDF on `sensplex.ca/wp-content/uploads/`. The PDFs contain:
- Detailed program description
- Schedule table (dates, times, locations)
- Pricing
- Registration instructions (typically email or phone)

One exception: **Goalie Academy** links to `davestathos.com/programs/10-week-program/` (external provider).

### Known PDF URLs (verified 2026-02-22)

PDF filenames on the Sensplex site sometimes get renamed (e.g., `-1` suffix added). The JavaScript extraction from the page DOM always has the current URLs. Here are the verified URLs — use these as a reference but always confirm against the page DOM:

| Program | PDF URL |
|---------|---------|
| 2026 Pop Up Clinics | `https://sensplex.ca/wp-content/uploads/2025-2026-Pop-Up-Clinic.pdf` |
| Hands HQ | `https://sensplex.ca/wp-content/uploads/Hands-HQ-Recreational.pdf` |
| Essential Defensive Skills | `https://sensplex.ca/wp-content/uploads/Winter-Essential-Defensive-Skills.pdf` |
| Sunrise Skills & Tactics | `https://sensplex.ca/wp-content/uploads/Sunrise-Skills-Tactics-1.pdf` |
| PD Day Hockey Camps | `https://sensplex.ca/wp-content/uploads/2025-26-PD-Day-Hockey-Camps.pdf` |
| Learn & Play | `https://sensplex.ca/wp-content/uploads/HEO-OSHP-Learn-Play-Development-Program.pdf` |
| Sparty Learn 2 Skate | `https://sensplex.ca/wp-content/uploads/Sparty-Learn-2-Skate-presented-by-eQ-Homes.pdf` |
| Intro 2 Hockey | `https://sensplex.ca/wp-content/uploads/Intro-2-Hockey.pdf` |
| IP Fundamental Skills | `https://sensplex.ca/wp-content/uploads/IP-Fundamentals.pdf` |
| Shooting & Puck Control | `https://sensplex.ca/wp-content/uploads/Shooting-Puck-Control.pdf` |
| Performance & Power Skating | `https://sensplex.ca/wp-content/uploads/Performance-Power-Skating-1.pdf` |
| Complete Player Development | `https://sensplex.ca/wp-content/uploads/Weekly-Skills-Complete-Player-Development.pdf` |
| Angling & Checking Clinic | `https://sensplex.ca/wp-content/uploads/Angling-Checking-Clinic.pdf` |
| Semi-Private Lessons | `https://sensplex.ca/wp-content/uploads/Semi-Private-Lessons-1.pdf` |
| Little Sens Selects | `https://sensplex.ca/wp-content/uploads/Little-Sens-Selects.pdf` |
| Goalie Academy | `https://davestathos.com/programs/10-week-program/` (external) |

**Previously incorrect URLs** (do NOT use these):
- ~~`Performance-Power-Skating.pdf`~~ → correct: `Performance-Power-Skating-1.pdf`
- ~~`Complete-Player-Development-1.pdf`~~ → correct: `Weekly-Skills-Complete-Player-Development.pdf`
- ~~`Semi-Private-Lessons.pdf`~~ → correct: `Semi-Private-Lessons-1.pdf`
- ~~`PD-Day-Hockey-Camps-1.pdf`~~ → correct: `2025-26-PD-Day-Hockey-Camps.pdf`

## Output Format

Organize programs by category:
1. **Featured & Specialty Programs**
2. **Introductory Programs**
3. **Recreational Programs**
4. **Competitive Programs**

Include for each:
- Program name
- Session date range
- Location (if specified)
- Status
- PDF flyer URL (as source_url)

## Data Persistence

After scanning, save results to both local JSON and Supabase.

**CRITICAL:** The `start_date` field MUST be set for sessions to appear in the app. The edge function filters by `start_date >= first_of_month`, so sessions with NULL `start_date` won't show up. In the local JSON, always include `session_date` (ISO date) for each session — the API uses it to set `start_date`. Also include `start_date` and `end_date` explicitly.

### Date Conversion

Convert the "Next Session:" text date ranges to ISO dates:
- "January-April, 2026" → `session_date: "2026-01-01"`, `start_date: "2026-01-01"`, `end_date: "2026-04-30"`
- "April-June, 2026" → `session_date: "2026-04-01"`, `start_date: "2026-04-01"`, `end_date: "2026-06-30"`
- "February 13, 2026" → `session_date: "2026-02-13"`, `start_date: "2026-02-13"`, `end_date: "2026-02-13"`
- "TBA" → use today's date as `session_date`/`start_date`, and a reasonable end date (e.g., end of season)

### Local JSON Audit Trail

Save to: `data/provider-scans/sensplex/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "sensplex",
  "scanned_at": "2026-02-22T18:00:00Z",
  "source_url": "https://sensplex.ca/programs/#youth-hockey-programs",
  "scan_date_start": "2026-01-04",
  "scan_date_end": "2026-04-19",
  "sessions": [
    {
      "program_name": "Hands HQ",
      "session_type": "series",
      "session_date": "2026-01-05",
      "start_date": "2026-01-05",
      "end_date": "2026-03-30",
      "day_of_week": "Monday",
      "start_time": "19:15",
      "end_time": "20:15",
      "location": "Richcraft Sensplex",
      "status": "available",
      "source_url": "https://sensplex.ca/wp-content/uploads/Hands-HQ-Recreational.pdf",
      "notes": "Recreational level. 11 sessions. $42/session ($462 total).",
      "min_birth_year": 2013,
      "max_birth_year": 2017,
      "price": 462.0
    },
    {
      "program_name": "Angling & Checking Clinic (Winter)",
      "session_type": "clinic",
      "session_date": "2026-02-23",
      "start_date": "2026-02-23",
      "end_date": "2026-03-23",
      "day_of_week": "Monday",
      "start_time": "19:15",
      "end_time": "20:15",
      "location": "Bell Sensplex",
      "status": "available",
      "source_url": "https://sensplex.ca/wp-content/uploads/Angling-Checking-Clinic.pdf",
      "notes": "4 sessions: Feb 23, Mar 2, 9, 23. $208 all sessions. Competitive players.",
      "min_birth_year": 2012,
      "max_birth_year": 2015,
      "price": 208.0
    },
    {
      "program_name": "Little Sens Selects",
      "session_type": "series",
      "session_date": "2026-01-04",
      "start_date": "2026-01-04",
      "end_date": "2026-04-19",
      "day_of_week": "Sunday",
      "start_time": "15:00",
      "end_time": "16:00",
      "location": "Bell Sensplex",
      "status": "limited",
      "source_url": "https://sensplex.ca/wp-content/uploads/Little-Sens-Selects.pdf",
      "notes": "12 sessions. Skater $624, Goalie $312. 2019-2020 LIMITED. Bell Sensplex only.",
      "min_birth_year": 2017,
      "max_birth_year": 2020,
      "price": 624.0
    }
  ],
  "summary": {
    "total": 19,
    "by_status": {
      "available": 17,
      "limited": 2
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
  -d @data/provider-scans/sensplex/scan-{YYYY-MM-DD-HHmmss}.json \
  | jq -r '
      .data as $d
      | "✓ upserted=\($d.sessions_upserted)/\($d.sessions_received) | archived=\($d.sessions_archived | length) | stale_active=\($d.stale_active_sessions // 0) | unresolved=\($d.unresolved_locations | length)",
        (if ($d.unresolved_locations | length) > 0 then "  ⚠ unresolved: " + ($d.unresolved_locations | join("; ")) else empty end),
        (if $d.sessions_upserted != $d.sessions_received then "  ⚠ upsert mismatch — investigate" else empty end),
        (if ($d.stale_active_sessions // 0) > 0 then "  ⚠ stale_active=\($d.stale_active_sessions) — auto-archive missed something" else empty end)
    '
```

The API handles:
- Looking up the provider by `provider` slug in the JSON (returns 404 if provider doesn't exist - provider must be created in Supabase first)
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

## Birth Year Parsing

Some programs mention birth years or age levels in the page text (not always in the program name):
- **Learn & Play Hockey Development Program** → U7-U15 → min: 2011, max: 2019
- **Angling & Checking Clinic** → born 2012-2015 → min: 2012, max: 2015
- **Little Sens Selects** → born 2017-2020 → min: 2017, max: 2020

For programs without explicit age/birth year info, set `min_birth_year` and `max_birth_year` to `null`.

## Notes

- This is a **static WordPress/Elementor page** - content changes infrequently (seasonal updates)
- Registration is PDF-based, not online forms - no live availability tracking possible
- Ottawa Senators Hockey Programs (OSHP) is the official program brand
- Programs are run by Ottawa Senators-affiliated instructors
- Contact: senshockeyprograms@sensplex.ca
- The Goalie Academy is powered by an external partner (Dave Stathos / Goalie Performance Centre)
