---
name: summit-goaltending
description: Check Summit Goaltending program availability. Use when the user says "check summit", "summit goaltending", "andrew's site", or asks about goaltending programs at Summit Goaltending in Ottawa.
---

# Summit Goaltending Program Checker

Check https://www.summitgoaltending.ca for available goaltending training programs in Ottawa.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension to interact with the Summit Goaltending website.**

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the Summit Goaltending website. Please ensure the extension is running and try again."

Do NOT attempt to use WebFetch or other non-browser tools - the Wix site requires JavaScript rendering and interactive navigation.

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. Navigate to https://www.summitgoaltending.ca
3. Locate and navigate to the programs/camps page (likely under "Programs", "Training", or "Camps" navigation)
4. **Phase 1 - Scan programs:** Identify all goaltending programs, camps, and clinics
5. **Phase 2 - Extract program details:** For each program, capture:
   - Program name (exact text as displayed)
   - Dates (start and end dates)
   - Times (if available)
   - Location/Arena
   - Status (available, limited, waitlist, sold_out)
   - Price (if displayed)
   - Age requirements (if displayed)
6. **Phase 3 - Capture source URLs:** Each session MUST have a `source_url` pointing to the program detail page or registration page
7. **Phase 4 - Save data:** Output JSON with all sessions

## Platform: Wix

Summit Goaltending uses the Wix platform. Key characteristics:

- Dynamic content loading via JavaScript
- May use Wix Bookings for scheduling
- Navigation typically via top menu or sidebar
- Program details may be on separate pages or expandable sections
- Registration buttons/links may open Wix booking widgets or external forms

### Navigation Tips

- Look for menu items: "Programs", "Training", "Camps", "Schedule", "Register"
- Wix sites often have multi-page navigation - click through to find program listings
- Check for dropdowns in the main navigation
- Programs may be organized by type (camps vs clinics) or by season

## Status Determination

Determine status for each program based on these indicators:

| Status | Indicators |
|--------|------------|
| `available` | Has **"Register"**, **"Sign Up"**, **"Book Now"** button, spots available |
| `limited` | Shows limited spots (e.g., "Only 3 spots left", "Limited availability") |
| `waitlist` | Shows **"Join Waitlist"**, "Waitlist Open", or program name contains "Waitlist" |
| `sold_out` | Shows **"Sold Out"**, **"Full"**, "Registration Closed", or no registration option |

## Program Types

Summit Goaltending specializes in goaltending training. Expected program types:

**Camps:**
- March Break goaltending camps
- Summer goaltending camps
- Holiday break camps
- Weekend intensive camps

**Clinics:**
- Single-day or multi-session clinics
- Position-specific training
- Skill development sessions

**Series:**
- Weekly goaltending training programs
- Session packages (6-week, 8-week programs)
- Seasonal training programs

**Drop-in:**
- Individual training sessions
- Pay-per-session goaltending practice

## Locations

Summit Goaltending programs run at Ottawa-area arenas. Common venues:
- City of Ottawa arenas
- Private facility locations
- May list specific arena names or just "Ottawa area"

**Important:** Match location strings to existing PuckFinder arenas. If the location string doesn't match an exact arena name, note it in the session for manual review.

## Output Format

Organize programs by status:
1. **Available** (status: available or limited)
2. **Waitlist** (status: waitlist)
3. **Sold Out** (status: sold_out)

Include for each:
- Program name
- Date(s)
- Time (if available)
- Location/Arena
- Status
- Source URL (program detail/registration page)
- Age requirements (if available)
- Price (if available)
- Session type classification

**Example output:**
```
## Available Programs

### Camps
- **March Break Goaltending Camp 2026**
  - March 16-20, 2026 | 9:00am-3:00pm | Bell Centennial Arena | status: available
  - Ages: 8-14 | Price: $495
  - Register: https://www.summitgoaltending.ca/march-break-camp

### Clinics
- **Advanced Goaltending Clinic**
  - April 12, 2026 | 10:00am-12:00pm | Sensplex | status: available
  - Ages: 12-17 | Price: $125
  - Register: https://www.summitgoaltending.ca/advanced-clinic

### Series
- **Spring Goaltending Development Program**
  - Saturdays Apr 5 - May 24, 2026 | 6:00-7:00pm | Nepean Sportsplex | status: limited (3 spots left)
  - Ages: 10-16 | Price: $450 (8 sessions)
  - Register: https://www.summitgoaltending.ca/spring-series

### Sold Out
- **Summer Elite Goaltending Camp**
  - July 14-18, 2026 | Richcraft Sensplex | status: sold_out
  - Page: https://www.summitgoaltending.ca/summer-camp
```

## Data Persistence

After scanning, save results to both local JSON and submit to the PuckFinder API.

### Local JSON Audit Trail

Save to: `data/provider-scans/summit-goaltending/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "summit-goaltending",
  "scanned_at": "2026-03-14T17:30:00Z",
  "source_url": "https://www.summitgoaltending.ca",
  "sessions": [
    {
      "program_name": "March Break Goaltending Camp 2026",
      "session_type": "camp",
      "session_date": "2026-03-16",
      "start_date": "2026-03-16",
      "end_date": "2026-03-20",
      "start_time": "09:00",
      "end_time": "15:00",
      "location": "Bell Centennial Arena",
      "status": "available",
      "source_url": "https://www.summitgoaltending.ca/march-break-camp",
      "min_birth_year": 2012,
      "max_birth_year": 2018,
      "price": 495.00,
      "notes": "5-day intensive goaltending camp"
    },
    {
      "program_name": "Advanced Goaltending Clinic",
      "session_type": "clinic",
      "session_date": "2026-04-12",
      "start_time": "10:00",
      "end_time": "12:00",
      "location": "Sensplex",
      "status": "available",
      "source_url": "https://www.summitgoaltending.ca/advanced-clinic",
      "min_birth_year": 2009,
      "max_birth_year": 2014,
      "price": 125.00,
      "notes": null
    }
  ],
  "summary": {
    "total": 8,
    "by_status": {
      "available": 5,
      "limited": 1,
      "waitlist": 0,
      "sold_out": 2
    }
  }
}
```

**IMPORTANT:** Every session object MUST include a `source_url` field with the direct program detail or registration link.

### Submit to API

After saving the local JSON, submit the scan data to the backend API:

```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/summit-goaltending/scan-{YYYY-MM-DD-HHmmss}.json
```

The API handles:
- Looking up the provider by `provider` slug in the JSON
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

## Age Information

If Summit Goaltending displays age requirements (e.g., "Ages 8-14", "Born 2010-2016"):

**From age ranges:**
- Convert to birth years using current year or "age as of" date if specified
- Example: "Ages 10-14" for 2026 programs → min_birth_year: 2012, max_birth_year: 2016

**From birth year ranges:**
- Use directly: "Born 2010-2016" → min_birth_year: 2010, max_birth_year: 2016

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Summit Examples |
|------|-----------|-----------------|
| `camp` | Multi-day consecutive programs | March Break camps, Summer camps, Holiday camps |
| `clinic` | Single-session or short special events | Weekend clinics, Skills clinics, Position clinics |
| `series` | Weekly recurring programs over multiple weeks | 6-week spring program, 8-week fall training |
| `drop_in` | Single standalone sessions, pay-per-session | Individual training sessions |
| `ice_rental` | Bookable ice rental time slots | — (not used for Summit Goaltending) |
| `unknown` | Default when type cannot be determined | General inquiries, waitlists |

**Classification rules:**
- Program name contains "Camp" → `camp`
- Program name contains "Clinic" → `clinic`
- Multi-day consecutive dates → `camp`
- Single date → `clinic` or `drop_in` (use context from description)
- Weekly sessions over multiple weeks → `series`
- When unclear, default to `clinic` for goaltending-specific training

## Date Parsing

**Multi-day programs (camps):**
- If shown as "March 16-20, 2026":
  - `session_date`: "2026-03-16" (first day)
  - `start_date`: "2026-03-16"
  - `end_date`: "2026-03-20"

**Single-day programs (clinics):**
- If shown as "April 12, 2026":
  - `session_date`: "2026-04-12"
  - `start_date`: null or same as session_date
  - `end_date`: null or same as session_date

**Series programs:**
- If shown as "Saturdays Apr 5 - May 24, 2026":
  - Create individual session rows for each date in the series
  - Each row gets its own `session_date`
  - OR create a single session with `session_date` as first date and `notes` describing the series

## Notes

- Summit Goaltending is a specialized provider (goaltending only)
- Smaller program volume compared to general hockey providers
- Andrew (the owner) is in the PuckFinder network - potential partnership opportunity
- Wix platform may require clicking through multiple pages to find all programs
- Check for hidden/collapsed sections with additional programs
- Look for both current and upcoming programs
- Programs may be listed under multiple navigation paths

## Troubleshooting

**If programs page is hard to find:**
- Check site navigation menu
- Look for "Book Now" or "Register" in header
- Try clicking logo to return to home, then explore links
- Check footer for sitemap or program links

**If registration buttons don't work:**
- Wix may use modal popups or booking widgets
- Check for external links to booking platforms (Wix Bookings, Google Forms, external registration)
- Document the registration method in `source_url`

**If no programs are visible:**
- Programs may be seasonal - document that no programs are currently available
- Check for "Coming Soon" or future program announcements
- Document findings and suggest checking back later
