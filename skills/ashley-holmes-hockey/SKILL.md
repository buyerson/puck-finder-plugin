---
name: ashley-holmes-hockey
description: Check Ashley Holmes Training hockey program availability for the family. Use when the user says "check ashley holmes", "ashley holmes training", "ashley holmes hockey", or asks about hockey programs at Ashley Holmes Training.
---

# Ashley Holmes Hockey Program Checker

Check https://ashleyholmes.uplifterinc.com/registration/ for available hockey programs.

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").
6. Use the program name exactly as listed on the schedule. Do not reformat age groups or add arena names to the program name — the arena goes in location.

## Arena/Location Naming Rules

- Before creating a new arena, check if it already exists by searching the `GET /arenas?q=` endpoint with a partial name match.
- Use the SHORT facility name (e.g. "Fred Barrett Arena", not "Fred G. Barrett Arena"). Do not append neighborhood, city, or rink-pad names to the arena name.
- If the arena already exists under a slightly different name, use the existing arena and add the variant as an alias via `PUT /arenas/:slug` with the `aliases` field, rather than creating a new arena.

## Workflow

1. Navigate to https://ashleyholmes.uplifterinc.com/registration/
2. The page displays "Program Registrations" with a list of all programs
3. Extract programs using JavaScript (see DOM Extraction below)
4. For each program, determine its **status** based on visual indicators
5. Note program details for each program:
   - Program name and type
   - Age group (e.g., U9-U12, U13+, U15-U18)
   - Day/Time (e.g., "Tuesdays 7:00-8:00am")
   - Location (e.g., "Minto Rec", "Amped SportsLab")
   - Start & End Date range
   - Price
   - **Status** (available, limited, waitlist, sold_out)
   - Spots left (if shown, e.g., "2 spot(s) left")

## DOM Extraction Strategy

The Uplifter page is a KnockoutJS app. Programs are rendered in a `<table class="prodListItems">` with each program as a `<tr>`. **Do NOT use `.list-group-item`, `.program-card`, or scroll-based extraction** — iterate the table rows instead.

### JavaScript Extraction

```javascript
var rows = document.querySelectorAll('table.prodListItems > tbody > tr');
var programs = [];
rows.forEach(function(tr) {
  var titleEl = tr.querySelector('.itemTitle');
  if (!titleEl) return;
  var name = titleEl.innerText.replace('» View Details', '').trim();
  var text = tr.innerText;

  var status = 'available';
  if (/\bFULL\b/.test(text)) status = 'waitlist';
  if (/\b0 spot\(s\) left\b/.test(text)) status = 'waitlist';
  else if (/[1-9]\d* spot\(s\) left/.test(text)) status = 'limited';

  var spotsMatch = text.match(/(\d+) spot\(s\) left/);
  var waitingMatch = text.match(/\((\d+) Waiting\)/);
  var dateMatch = text.match(/Start & End Date:\s*\n?\s*([A-Z][a-z]+ \d+, \d{4}\s*-\s*[A-Z][a-z]+ \d+, \d{4})/);
  var dayTimeMatch = text.match(/Day \/ Time \/ Location:\s*\n?\s*([^\n]+)/);
  var eventsMatch = text.match(/(\d+) Events?/);
  var allPrices = text.match(/\$[\d,.]+/g);
  var totalPrice = allPrices && allPrices.length > 0
    ? parseFloat(allPrices[allPrices.length-1].replace('$','').replace(',',''))
    : null;

  programs.push({
    name: name,
    status: status,
    spots: spotsMatch ? parseInt(spotsMatch[1]) : null,
    waiting: waitingMatch ? parseInt(waitingMatch[1]) : null,
    dates: dateMatch ? dateMatch[1].trim() : null,
    dayTime: dayTimeMatch ? dayTimeMatch[1].trim() : null,
    events: eventsMatch ? parseInt(eventsMatch[1]) : null,
    price: totalPrice,
  });
});
```

### Program Name Cleaning

The raw program name from the DOM includes the arena in parentheses and a sport suffix. Strip these before saving:
- Remove `(Arena Name)` — the arena goes in `location`
- Remove trailing `Hockey & Ringette` or `Hockey` — these are sport qualifiers, not the program name

Example: `"U12 & Older Edge/Speed COMP (Mlacak Arena Kanata) Hockey & Ringette"` → program_name: `"U12 & Older Edge/Speed COMP"`, location: `"John Mlacak Arena"`

### Location Name Mapping

Map the short names from the website to full arena names used in the database:

| Website Name | Arena Name |
|-------------|------------|
| Mlacak Arena Kanata | John Mlacak Arena |
| Minto Rec. / Minto Rec. Barrhaven | Minto Recreation Complex |
| Tony Graham Arena Kanata | Tony Graham Arena |
| Amped SportsLab | Amped Sports Lab |
| Bell Sensplex | Bell Sensplex |
| Barbara Ann Acott Arena | Barbara Ann Scott Arena |
| Carleton University | Carleton University Ice House |
| Walter Baker | Walter Baker Sports Centre |
| Cardel Rec. | Cardel Recreation Complex |
| Nepean Sportsplex | Nepean Sportsplex |
| Kemptville | Kemptville Arena |

### Chrome Extension Output Limitation

The Claude in Chrome extension blocks JavaScript output containing URL query strings (cookie/query filter). When extracting data:
1. Extract session data WITHOUT source_url fields from the browser
2. Add source_url mappings server-side (in bash/python) using the filter ID tables below
3. Save the complete JSON locally, then submit via curl

## Filtered Source URLs (REQUIRED)

The Uplifter registration platform supports URL query parameters that pre-filter the program list. Every session's `source_url` MUST use a filtered deep link so users see only the relevant programs when they click through.

### URL Format

Base URL: `https://ashleyholmes.uplifterinc.com/registration/`

**Preferred filter (most specific):** `?category_level_id%5B%5D={id}` (URL-encoded form of `?category_level_id[]={id}`)

**Broad category filter:** `?category_id%5B%5D={id}` (URL-encoded form of `?category_id[]={id}`)

**Season filter:** `?season_id%5B%5D={id}` (URL-encoded form of `?season_id[]={id}`)

**Combining filters:** All filter types can be combined with `&`:
`?category_level_id%5B%5D=56&season_id%5B%5D=9` → Speed/Edge COMP U11-Hockey, Spring 2026 only

**IMPORTANT:** Always prefer `category_level_id` over `category_id` when the age group is known. This gives users the most targeted view (e.g., only U11 programs instead of all age groups in Speed/Edge COMP).

### Category Filter IDs (broad — use as fallback only)

| ID | Category Name | Programs |
|----|--------------|----------|
| 1 | Power skating Group lessons | Edge/Speed Fundamentals, Speed/Edge COMP group lessons |
| 2 | Summer Conditioning Camps | Off-ice conditioning camps, COMPETITIVE CONDITIONING CAMP |
| 3 | Fundamentals | ELEVATE small group training |
| 4 | Little Tykes | Little Tykes beginner programs (U7, U8, U9) |
| 5 | Speed/Edge COMP | Edge/Speed COMP, Edge House/Comp, Edge OPEN, HOCKEY EDGE DEV + SHOOT-TO-SCORE |
| 6 | Speed Development AA/AAA | AA/AAA Speed/Edge, U18AAA/Junior A/B |
| 8 | Pre-Tryout | PRE-TRYOUT AA/AAA single sessions |
| 11 | March Break Camps | PRE-TRYOUT COMPETITIVE CONDITIONING CAMP (March Break only) |

### Category Level Filter IDs (PREFERRED — most specific)

**Little Tykes (category 4):**

| ID | Level |
|----|-------|
| 59 | U7 |
| 19 | U7 (alternate) |
| 20 | U8 |
| 78 | U9-Hockey |

**Speed/Edge COMP (category 5):**

| ID | Level | Example URL |
|----|-------|-------------|
| 57 | U9-Hockey | `?category_level_id%5B%5D=57` |
| 54 | U10-Hockey | `?category_level_id%5B%5D=54` |
| 56 | U11-Hockey | `?category_level_id%5B%5D=56` |
| 27 | U12-Hockey | `?category_level_id%5B%5D=27` |
| 21 | U12-Ringette | `?category_level_id%5B%5D=21` |
| 28 | U13-Hockey | `?category_level_id%5B%5D=28` |
| 22 | U13-Ringette | `?category_level_id%5B%5D=22` |
| 29 | U14-Hockey | `?category_level_id%5B%5D=29` |
| 23 | U14-Ringette | `?category_level_id%5B%5D=23` |
| 30 | U15-Hockey | `?category_level_id%5B%5D=30` |
| 24 | U15-Ringette | `?category_level_id%5B%5D=24` |
| 31 | U16-Hockey | `?category_level_id%5B%5D=31` |
| 25 | U16-Ringette | `?category_level_id%5B%5D=25` |
| 32 | U17-Hockey | `?category_level_id%5B%5D=32` |
| 26 | U17-Ringette | `?category_level_id%5B%5D=26` |
| 33 | U18-Hockey | `?category_level_id%5B%5D=33` |
| 34 | U18-Ringette | `?category_level_id%5B%5D=34` |

**Speed Development AA/AAA (category 6):**

| ID | Level |
|----|-------|
| 35 | U13-Hockey |
| 37 | U14-Hockey |
| 41 | U16-Hockey |
| 43 | U17-Hockey |
| 45 | U18-Hockey |

**March Break Camps (category 11):**

| ID | Level |
|----|-------|
| 67 | U10-Hockey |
| 65 | U11-Hockey |
| 69 | U12-Hockey |
| 71 | U13-Hockey |
| 73 | U14-Hockey |
| 75 | U15-Hockey |

**Pre-Tryout (category 8):**

| ID | Level |
|----|-------|
| 58 | Competitive |

**Summer Conditioning Camps (category 2):**

| ID | Level |
|----|-------|
| 6 | U9-U11 |
| 7 | U12-U15 |
| 8 | U18AAA |

**Power skating Group lessons (category 1):**

| ID | Level |
|----|-------|
| 1 | Edge/Speed Fundamentals |
| 2 | Speed/Edge COMP |

### Season Filter IDs

| ID | Season |
|----|--------|
| 8 | Winter 2026 |
| 9 | Spring 2026 |
| 10 | Summer 2026 |

### Program-to-URL Mapping Rules

Apply these rules to assign the `source_url` for each session. **Always use `category_level_id` when the age group can be determined.** Fall back to `category_id` only when age group is ambiguous or spans multiple levels.

```
base = "https://ashleyholmes.uplifterinc.com/registration/"

# Step 1: Determine the category
if "PRE-TRYOUT" in name AND ("CONDITIONING CAMP" in name OR "MARCH BREAK" in name):
    category = "march_break"
elif "PRE-TRYOUT" in name:
    category = "pre_tryout"
elif "AA/AAA" in name:
    category = "aa_aaa"
elif "Edge/Speed COMP" in name or "Edge House/Comp" in name:
    category = "speed_edge_comp"
elif "EDGE DEV" in name or "SHOOT-TO-SCORE" in name:
    category = "speed_edge_comp"
elif "ELEVATE" in name:
    category = "fundamentals"
elif "Summer" in name or "Conditioning Camp" in name (non-March-Break):
    category = "summer_camps"
elif "Power skating" in name or "Group lesson" in name:
    category = "power_skating"
else:
    category = "unknown"

# Step 2: Build URL using category_level_id when age group is known
# Look up the category_level_id from the tables above using (category + age_group)
# Example: category="speed_edge_comp" + age_group="U11" → category_level_id=56

if category_level_id is found:
    source_url = base + "?category_level_id%5B%5D=" + category_level_id
elif category == "march_break":
    source_url = base + "?category_id%5B%5D=11"
elif category == "pre_tryout":
    source_url = base + "?category_id%5B%5D=8"
elif category == "aa_aaa":
    source_url = base + "?category_id%5B%5D=6"
elif category == "speed_edge_comp":
    source_url = base + "?category_id%5B%5D=5"
elif category == "fundamentals":
    source_url = base + "?category_id%5B%5D=3"
elif category == "summer_camps":
    source_url = base + "?category_id%5B%5D=2"
elif category == "power_skating":
    source_url = base + "?category_id%5B%5D=1"
else:
    source_url = base   # Fallback: generic page
```

**Examples of ideal `source_url` values:**
- "U12 & Older Edge/Speed COMP (Mlacak Arena)" with U11 age → `?category_level_id%5B%5D=56`
- "PRE-TRYOUT COMPETITIVE CONDITIONING CAMP" with U12 age → `?category_level_id%5B%5D=69`
- "AA/AAA Speed/Edge" with U14 age → `?category_level_id%5B%5D=37`
- "ELEVATE" (no specific age level in filter) → `?category_id%5B%5D=3`

### Multi-age programs

When a single program covers a range of ages (e.g., "U12 & Older Edge/Speed COMP" includes U11 through U18), use the SINGLE most specific `category_level_id` that matches the session's listed age group for `source_url`.

### How it works technically

The Uplifter platform uses KnockoutJS. When the page loads with filter params in the URL, the JS framework reads the query parameters and automatically selects the corresponding filters, showing only matching programs. This works reliably on direct navigation (no need for JS interaction). All four filter types (`category_id`, `category_level_id`, `season_id`, `location_id`) work as URL params and combine with `&`.

### Discovering new filter IDs

If new categories appear in the future, you can discover their IDs by running this JavaScript on the registration page. NOTE: `.main-area` may not exist — iterate all elements to find the KO context:

```javascript
// Find KO-bound element (iterate if .main-area doesn't work)
var vm;
var allElements = document.querySelectorAll('*');
for (var i = 0; i < allElements.length; i++) {
  try {
    var ctx = ko.contextFor(allElements[i]);
    if (ctx && ctx.$root && ctx.$root.filter_groups) { vm = ctx.$root; break; }
  } catch(e) {}
}
// Extract all filters
vm.filter_groups().forEach(function(fg) {
  fg.filters().forEach(function(f) {
    console.log(fg.name() + ' | ' + f.id() + ' | ' + f.name());
  });
});
```

## Status Determination

Determine status for each program based on these indicators:

| Status | Indicators |
|--------|------------|
| `available` | Has purple **"REGISTER"** button, no spots warning |
| `limited` | Has **"REGISTER"** button AND shows "X spot(s) left" |
| `waitlist` | Shows **"FULL"** status OR has **"JOIN WAITLIST"** button OR shows "(X Waiting)" |
| `sold_out` | Shows **"Sold Out"** or completely unavailable |

## Program Types

**Regular Programs:**
- Edge/Speed COMP - Edge work and speed development
- Edge House/Comp - Edge development for house/competitive players
- ELEVATE - Small group training (NEW program)
- HOCKEY EDGE DEV + SHOOT-TO-SCORE - Combined skills
- AA/AAA Speed/Edge - High-level speed and edge work

**Pre-Tryout Programs:**
- PRE-TRYOUT AA/AAA - Tryout preparation sessions (various age groups)
- PRE-TRYOUT COMPETITIVE CONDITIONING CAMP - March Break camps

## Age Groups

Capture all age groups found:
- U9, U10, U11, U12, U13, U14, U15, U16, U17, U18
- Range formats: U9-U12, U10-U13, U11-U14, U12-U14, U13-U16, U14-U16, U15-U18
- Open-ended: U11+, U12+, U13+

## Locations

Programs run at multiple venues:
- Minto Rec (Barrhaven)
- Amped SportsLab
- Mlacak Arena (Kanata)
- Tony Graham Arena (Kanata)
- Bell Sensplex
- Walter Baker Sports Centre
- Cardel Rec (Katie Xu Arena)
- Nepean Sportsplex (Yzerman)
- Carleton University
- Barbara Ann Acott Arena

## Output Format

Organize programs by status:
1. **Available** (status: available or limited)
2. **Waitlist/Full** (status: waitlist)
3. **Sold Out** (status: sold_out)

Include for each:
- Program name
- Age group
- Day/Time
- Location
- Date range
- Price
- Status
- Spots remaining (if shown)
- Source URL (filtered Uplifter link)

**Example output:**
```
## Available Programs

### Available Now
- **U15-U18 AA/AAA Speed/Edge** - Tuesdays 3:15-4:15pm @ Minto Rec
  - Jan 6 - Apr 28, 2026 | $780.04 | status: limited (2 spots left)
  - source_url: ?category_level_id%5B%5D=45

### Pre-Tryout Sessions
- **PRE-TRYOUT AA/AAA: U10-U12** - Tuesday 5:00-6:00pm @ Nepean Sportsplex
  - Mar 10, 2026 | $60.00 | status: available
  - source_url: ?category_level_id%5B%5D=58

### Waitlist (Full)
- **U12 & Older Edge/Speed COMP** - Wednesday 7:00am @ Mlacak Arena
  - status: waitlist (5 waiting)
  - source_url: ?category_level_id%5B%5D=27

### Sold Out
- **ELEVATE U11-U14** - status: sold_out
  - source_url: ?category_id%5B%5D=3
```

## Data Persistence

After scanning, save results to both local JSON and Supabase.

**CRITICAL:** The `start_date` field MUST be set for sessions to appear in the app. The edge function filters by `start_date >= first_of_month`, so sessions with NULL `start_date` won't show up. Always include `session_date` (ISO date) for each session — the API uses it to set `start_date`. Also include `start_date` and `end_date` explicitly.

### Local JSON Audit Trail

Save to: `data/provider-scans/ashley-holmes/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "scan_id": "uuid",
  "provider": "ashley-holmes",
  "scanned_at": "2026-01-20T10:30:00Z",
  "source_url": "https://ashleyholmes.uplifterinc.com/registration/",
  "scan_date_start": "2026-01-06",
  "scan_date_end": "2026-04-28",
  "sessions": [
    {
      "program_name": "U15-U18 AA/AAA Speed/Edge (Minto Rec.)",
      "session_type": "series",
      "session_date": "2026-01-06",
      "start_date": "2026-01-06",
      "end_date": "2026-04-28",
      "day_of_week": "Tuesday",
      "start_time": "07:00",
      "end_time": "08:00",
      "location": "Minto Rec",
      "status": "waitlist",
      "source_url": "https://ashleyholmes.uplifterinc.com/registration/?category_level_id%5B%5D=45",
      "min_birth_year": 2008,
      "max_birth_year": 2011,
      "price": null,
      "notes": "FULL - 5 Waiting"
    },
    {
      "program_name": "PRE-TRYOUT AA/AAA: U10-U12 (Nepean Sportsplex) Hockey",
      "session_type": "clinic",
      "session_date": "2026-03-05",
      "start_date": "2026-03-05",
      "end_date": "2026-03-05",
      "day_of_week": "Thursday",
      "start_time": "17:00",
      "end_time": "18:00",
      "location": "Nepean Sportsplex",
      "status": "available",
      "source_url": "https://ashleyholmes.uplifterinc.com/registration/?category_level_id%5B%5D=58",
      "min_birth_year": 2014,
      "max_birth_year": 2016,
      "price": 60.00,
      "notes": null
    }
  ],
  "summary": {
    "total": 17,
    "by_status": {
      "available": 3,
      "limited": 2,
      "waitlist": 9,
      "sold_out": 3
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
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/ashley-holmes/scan-{YYYY-MM-DD-HHmmss}.json
```

The API handles:
- Looking up the provider by `provider` slug in the JSON
- Upserting sessions (setting `is_active` based on status: available/limited → true, else false)
- Updating `last_scanned_at` on the provider
- Inserting a scan record for audit trail

#### Birth Year Parsing

Convert age groups to birth years (based on 2026 season):
- `min_birth_year` = oldest eligible players (earlier year)
- `max_birth_year` = youngest eligible players (later year)

Formula: `birth_year = 2026 - age_level`

Examples:
- U9 → min_birth_year: 2017, max_birth_year: 2017
- U9-U12 → min_birth_year: 2014, max_birth_year: 2017
- U10-U12 → min_birth_year: 2014, max_birth_year: 2016
- U10-U13 → min_birth_year: 2013, max_birth_year: 2016
- U11-U14 → min_birth_year: 2012, max_birth_year: 2015
- U12-U14 → min_birth_year: 2012, max_birth_year: 2014
- U11+ → min_birth_year: 2008, max_birth_year: 2015
- U12+ → min_birth_year: 2008, max_birth_year: 2014
- U13+ → min_birth_year: 2008, max_birth_year: 2013
- U13-U16 → min_birth_year: 2010, max_birth_year: 2013
- U14-U16 → min_birth_year: 2010, max_birth_year: 2012
- U15-U18 → min_birth_year: 2008, max_birth_year: 2011

## Session Type Classification

Every session MUST include a `session_type` field. Valid values:

| Type | Definition | Ashley Holmes Examples |
|------|-----------|----------------------|
| `camp` | Multi-day consecutive programs | PRE-TRYOUT COMPETITIVE CONDITIONING CAMP (March Break) |
| `drop_in` | Single standalone sessions, pay-per-session | Individual PRE-TRYOUT sessions ($60 each) |
| `series` | Weekly recurring programs over multiple weeks | Edge/Speed COMP (Jan-Apr weekly), ELEVATE, HOCKEY EDGE DEV + SHOOT-TO-SCORE, AA/AAA Speed/Edge |
| `clinic` | One-time or short special events | Single-date PRE-TRYOUT AA/AAA sessions |
| `ice_rental` | Bookable ice rental time slots (City of Ottawa arenas) | — (not used for Ashley Holmes) |
| `unknown` | Default when type cannot be determined | — |

**Ashley Holmes classification rules:**
- Programs with start_date to end_date spanning multiple months with weekly sessions = `series`
- PRE-TRYOUT single-date sessions = `clinic`
- PRE-TRYOUT COMPETITIVE CONDITIONING CAMP (multi-day) = `camp`
- ELEVATE (recurring small group) = `series`
