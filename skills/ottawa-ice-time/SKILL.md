---
name: ottawa-ice-time
description: Check City of Ottawa last-minute ice time availability across all city arenas. Use when the user says "check ottawa ice", "city ice time", "last minute ice", "ottawa arena", or asks about available ice rental slots at City of Ottawa arenas.
---

# City of Ottawa Last-Minute Ice Time Checker

Scan all City of Ottawa arenas for available last-minute ice rental time slots using the ActiveNet reservation platform.

## CRITICAL: Chrome Extension Required

**This skill REQUIRES the Claude in Chrome browser extension** to call the ActiveNet REST API from the browser context (same-origin requests).

Before starting, check if the Chrome extension is available by calling `mcp__claude-in-chrome__tabs_context_mcp`. If the extension is not running or unavailable, immediately respond:

> "I cannot complete this skill because it requires the Claude in Chrome browser extension to interact with the City of Ottawa reservation system. Please ensure the extension is running and try again."

## Platform Overview

The City of Ottawa uses ActiveNet/ActiveCommunities (`anc.ca.apm.activecommunities.com/ottawa`) for facility reservations. The REST API is publicly accessible (no auth needed to VIEW availability) and returns structured JSON.

**Reservation rules:**
- Residents and non-residents can book 24 hours to 15 days in advance
- Booked on the hour, 1-hour rental blocks
- All facilities are "Arena LMI" type with max 30 attendees

## Program Naming Rules (CRITICAL for deduplication)

1. Use the program/series name EXACTLY as it appears on the website. Do not rephrase, abbreviate, or embellish.
2. Do NOT prepend dates, day names, or months to the program name. The date goes in start_date, not in program_name.
3. If a program has a subtitle or qualifier in parentheses on the website, include it. If it doesn't, don't add one.
4. For multi-day camps/series, use the SAME program_name for every session in the series. Differentiate sessions by start_date, not by name.
5. For locations with multiple rinks/pads, put the specific rink name in a separate field if available, but keep location as the facility name only (e.g. "Pinecrest Recreation Complex", NOT "Pinecrest Recreation Complex (Barbara Ann Scott)").
6. Use only the facility name for location (e.g. "Pinecrest Recreation Complex"). Put the specific pad/rink name (e.g. "Barbara Ann Scott", "Ron Racette") in a rink_name or notes field if available, but NOT in program_name or location.

## Workflow

1. **Verify Chrome extension is available** by calling `mcp__claude-in-chrome__tabs_context_mcp`
2. Create a new tab and navigate to `https://anc.ca.apm.activecommunities.com/ottawa/reservation/search` (needed to establish browser session context)
3. Wait 3 seconds for the SPA to load
4. Store the facility list on `window.__facilities`
5. **Resolve arenas** — fetch existing arenas from the API, compare against the scan's unique location names, and auto-create any missing arenas before submitting sessions
6. Query each month (today through August 31st) as a separate JavaScript call, querying all 52 facilities in batches of 10
7. After all months are queried, build session objects and submit to the API in monthly chunks
8. Present a summary of available slots

### JavaScript Extraction Strategy

The availability data comes from a REST API that can be called directly from the browser context. **Do NOT interact with the calendar widget** - use the API directly.

**Availability API:**
```
GET https://anc.ca.apm.activecommunities.com/ottawa/rest/reservation/resource/availability/daily/{facilityId}?start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&customer_id=0&company_id=0&event_type_id=-1&attendee=1&no_cache=true&locale=en-US
```

**Response structure:**
```json
{
  "body": {
    "details": {
      "resource_id": 2609,
      "reservation_unit": 7,
      "daily_details": [
        {
          "date": "2026-02-25",
          "status": 0,
          "times": [
            {
              "id": 8,
              "start_time": "15:00:00",
              "end_time": "16:00:00",
              "available": true,
              "is_cross_day": false
            }
          ]
        }
      ]
    }
  }
}
```

**Key fields:**
- `daily_details[].date` - the date (YYYY-MM-DD)
- `daily_details[].times[].available` - whether the slot is bookable
- `daily_details[].times[].start_time` / `end_time` - time in HH:MM:SS format
- `daily_details[].times[].is_cross_day` - true if end time is past midnight

### Step 5: Resolve Arenas (Auto-Create Missing)

Before submitting sessions, ensure all arena locations exist in the database. This prevents sessions from landing in `unresolved_locations`.

- Fetches existing arenas via `GET /arenas` and builds a set of known aliases (case-insensitive)
- Compares unique location names from `window.__facilities` against known aliases
- Creates missing arenas via `POST /arenas` with `name`, auto-generated `slug`, `city: "Ottawa"`, and an alias matching the location string

```javascript
(async () => {
  const API = 'https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api';
  const HEADERS = { 'x-api-key': 'pf-write-k8x7m2nQ9vR4', 'Content-Type': 'application/json' };

  // 1. Get existing arenas + aliases
  const res = await fetch(API + '/arenas', { headers: HEADERS });
  const { data: arenas } = await res.json();
  const knownAliases = new Set();
  arenas.forEach(a => a.app_arena_aliases.forEach(x => knownAliases.add(x.alias.toLowerCase())));

  // 2. Get unique locations from facility list
  const locations = [...new Set(window.__facilities.map(f => f.center))];

  // 3. Create missing arenas
  const missing = locations.filter(loc => !knownAliases.has(loc.toLowerCase()));
  const created = [];
  for (const name of missing) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const r = await fetch(API + '/arenas', {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ name, slug, city: 'Ottawa', aliases: [name] })
    });
    created.push({ name, slug, status: r.status });
  }
  return `Arenas checked: ${locations.length}, missing: ${missing.length}, created: ${JSON.stringify(created)}`;
})()
```

### Batch Query Strategy — Monthly Chunks

**CRITICAL: Query in monthly chunks, NOT the full date range at once.** Querying 52 facilities × 6 months in a single JavaScript call produces responses too large for the Chrome extension and will cause disconnects/timeouts.

**Step 4a:** Store the facility list on `window.__facilities` using the compact format:

```javascript
window.__facilities = [
  {id:2609,center:"Bell Centennial Arena",rink:"BLCA"},
  {id:251,center:"Bell Sensplex",rink:"BrokerLink"},
  // ... (see FACILITY_MAP below for the full list)
];
window.__allSlots = [];
'Facilities stored: ' + window.__facilities.length;
```

**Step 6a:** For each month from today through August 31st, run a **separate** JavaScript call:

```javascript
// Run this ONCE PER MONTH — adjust start/end for each month
(async () => {
  const fs = window.__facilities;
  const start = '2026-03-01', end = '2026-03-31'; // <-- change per month
  const base = 'https://anc.ca.apm.activecommunities.com/ottawa/rest/reservation/resource/availability/daily/';
  const params = `?start_date=${start}&end_date=${end}&customer_id=0&company_id=0&event_type_id=-1&attendee=1&no_cache=true&locale=en-US`;

  let slots = [];
  for (let i = 0; i < fs.length; i += 10) {
    const batch = fs.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(f =>
        fetch(base + f.id + params).then(r => r.json()).then(data => {
          return data.body.details.daily_details.flatMap(day =>
            day.times.filter(t => t.available).map(t => ({
              fid: f.id, center: f.center, rink: f.rink,
              date: day.date, st: t.start_time.substring(0,5), et: t.end_time.substring(0,5)
            }))
          );
        }).catch(() => [])
      )
    );
    slots.push(...results.flat());
  }
  window.__marchSlots = slots; // <-- use month name: __marchSlots, __aprilSlots, etc.
  return `March: ${slots.length} slots`;
})()
```

Repeat for each month: March → April → May → June → July → August (6 separate JS calls).

**Step 7a:** After all months are queried, build session objects and submit to the API **one month at a time** (see API Submission below).

### Date Range Rules

- **Start date:** today (current date)
- **End date:** August 31st of the current year
- **Always scan the full range through Aug 31** — the API returns all available slots regardless of the 15-day booking window
- Query **one calendar month per JavaScript call** to avoid Chrome extension disconnects
- The 15-day booking window is a reservation rule (users can only BOOK within 15 days), but the API returns availability data for the entire range and we want to capture it all for planning purposes

## Facility Map (52 Arenas)

All facilities are "Arena LMI" type. The facility ID is used in the API URL.

| Facility ID | Facility Name | Center/Arena |
|------------|--------------|--------------|
| 2609 | BLCA-Arena Bell Centennial-LMI | Bell Centennial Arena |
| 251 | BLSX-Arena Bell Sensplex-BrokerLink LMI | Bell Sensplex |
| 257 | BLSX-Arena Bell Sensplex-CanadianTire LMI | Bell Sensplex |
| 253 | BLSX-Arena Bell Sensplex-Myers Auto LMI | Bell Sensplex |
| 255 | BLSX-Arena BellSensplex-MattamyHomes LMI | Bell Sensplex |
| 19 | BMRC-Arena BobMacQuarrie-Eliz.Manley LMI | Bob MacQuarrie Recreation Complex - Orléans |
| 39 | BMRC-Arena BobMacQuarrie-RogerSénécal LMI | Bob MacQuarrie Recreation Complex - Orléans |
| 2620 | BRGA-Arena Bernard Grandmaître LMI | Bernard Grandmaître Arena |
| 2963 | BRWA-Arena Brewer LMI | Brewer Arena |
| 2635 | CANT-Arena Canterbury-Brian Kilrea LMI | Canterbury Recreation Complex |
| 2639 | CRCG-Arena CARDELREC-KatieXu/JackFan LMI | CardelRec Complex (Goulbourn) |
| 2641 | CRCG-Arena CARDELREC-Matt Bradley LMI | CardelRec Complex (Goulbourn) |
| 2651 | EARA-Arena Earl Armstrong LMI | Earl Armstrong Arena |
| 2663 | FGBA-Arena Fred G. Barrett-East Rink LMI | Fred G. Barrett Arena |
| 2668 | FGBA-Arena Fred G. Barrett-West Rink LMI | Fred G. Barrett Arena |
| 2692 | HDCA-Arena Howard Darwin LMI | Howard Darwin Centennial-Merivale Arena |
| 2706 | JADA-Arena J.A.Dulude LMI | J. A. Dulude Arena |
| 2708 | JCHA-Arena Jack Charron LMI | Jack Charron Arena |
| 2829 | JDRC-Arena Jim Durrell-01 LMI | Jim Durrell Recreation Centre |
| 2831 | JDRC-Arena Jim Durrell-02 LMI | Jim Durrell Recreation Centre |
| 2724 | JGMC-Arena J.G.Mlacak LMI | John G. Mlacak Centre |
| 2843 | JLSC-Arena Johnny Leroux LMI | Johnny Leroux Stittsville Community Arena |
| 2624 | LKAR-Arena Lois Kemp LMI | Lois Kemp Arena |
| 2856 | MANO-Arena Manotick LMI | Manotick Community Centre |
| 2858 | MCNB-Arena McNabb LMI | McNabb Recreation Centre |
| 2862 | METC-Arena Metcalfe LMI | Metcalfe Community Centre |
| 1542 | MRCB-Arena Minto Barrhaven-North LMI | Minto Recreation Complex-Barrhaven |
| 1545 | MRCB-Arena Minto Barrhaven-South LMI | Minto Recreation Complex-Barrhaven |
| 2871 | NVCC-Arena Navan LMI | Navan Memorial Community Centre |
| 2879 | OSCC-Arena Stuart Holmes LMI | Osgoode Community Centre |
| 1886 | PINE-Arena-Barbara Ann Scott LMI | Pinecrest Recreation Complex |
| 1971 | RFRC-Arena Ray Friel-02 LMI | Ray Friel Recreation Complex |
| 2907 | RFRC-Arena Ray Friel-03 LMI | Ray Friel Recreation Complex |
| 2909 | RFRC-Arena Ray Friel-Ron Racette LMI | Ray Friel Recreation Complex |
| 2088 | RICS-Arena Richcraft Sensplex-HEO LMI | Richcraft Sensplex |
| 2090 | RICS-Arena Richcraft Sensplex-Potvin LMI | Richcraft Sensplex |
| 2085 | RICS-Arena RichcraftSensplex-CdnTire LMI | Richcraft Sensplex |
| 2911 | RICS-Arena RichcraftSensplex-CIBC LMI | Richcraft Sensplex |
| 2905 | RJKC-Arena R.J. Kennedy LMI | R.J. Kennedy Arena and Community Hall |
| 2888 | RMCC-Arena Richmond LMI | Richmond Memorial Community Centre |
| 2934 | SAHA-Arena Sandy Hill LMI | Sandy Hill Arena |
| 2793 | SPLX-Arena Nepean SPLX-A.MacDonald LMI | Nepean Sportsplex |
| 2794 | SPLX-Arena Nepean Sportsplex-03 LMI | Nepean Sportsplex |
| 2792 | SPLX-Arena Nepean Sportsplex-S.Yzerman LMI | Nepean Sportsplex |
| 2767 | STLA-Arena St-Laurent LMI | St-Laurent Complex |
| 2950 | TBRA-Arena Tom Brown LMI | Tom Brown Arena |
| 2847 | TGRC-Arena Tony Graham-Gary Burke LMI | Tony Graham Recreation Complex-Kanata |
| 2849 | TGRC-Arena Tony Graham-Tom Flood LMI | Tony Graham Recreation Complex-Kanata |
| 2746 | WBSC-Arena Walter Baker-A LMI | Walter Baker Sports Centre |
| 2748 | WBSC-Arena Walter Baker-B LMI | Walter Baker Sports Centre |
| 506 | WCCC-Arena-Cavanagh Sensplex LMI | West Carleton Community Complex |
| 2955 | WEJA-Arena W. Erskine Johnston LMI | W. Erskine Johnston Arena |

### Center-to-Location Mapping for Puck Finder

When submitting to the Puck Finder API, use these `location` values (matching existing arena names in the database where possible):

| Center Name | Puck Finder Location |
|------------|---------------------|
| Bell Centennial Arena | Bell Centennial Arena |
| Bell Sensplex | Bell Sensplex |
| Bob MacQuarrie Recreation Complex - Orléans | Bob MacQuarrie Recreation Complex |
| Bernard Grandmaître Arena | Bernard Grandmaître Arena |
| Brewer Arena | Brewer Arena |
| Canterbury Recreation Complex | Canterbury Recreation Complex |
| CardelRec Complex (Goulbourn) | Cardel Rec (Katie Xu Arena) |
| Earl Armstrong Arena | Earl Armstrong Arena |
| Fred G. Barrett Arena | Fred Barrett Arena |
| Howard Darwin Centennial-Merivale Arena | Howard Darwin Arena |
| J. A. Dulude Arena | J.A. Dulude Arena |
| Jack Charron Arena | Jack Charron Arena |
| Jim Durrell Recreation Centre | Jim Durrell Recreation Centre |
| John G. Mlacak Centre | John G. Mlacak Community Centre |
| Johnny Leroux Stittsville Community Arena | Johnny Leroux Arena |
| Lois Kemp Arena | Lois Kemp Arena |
| Manotick Community Centre | Manotick Arena |
| McNabb Recreation Centre | McNabb Arena |
| Metcalfe Community Centre | Metcalfe Arena |
| Minto Recreation Complex-Barrhaven | Minto Recreation Complex |
| Navan Memorial Community Centre | Navan Arena |
| Osgoode Community Centre | Osgoode Arena |
| Pinecrest Recreation Complex | Pinecrest Recreation Complex |
| Ray Friel Recreation Complex | Ray Friel Recreation Complex |
| Richcraft Sensplex | Richcraft Sensplex |
| R.J. Kennedy Arena and Community Hall | R.J. Kennedy Arena |
| Richmond Memorial Community Centre | Richmond Arena |
| Sandy Hill Arena | Sandy Hill Arena |
| Nepean Sportsplex | Nepean Sportsplex |
| St-Laurent Complex | St-Laurent Complex |
| Tom Brown Arena | Tom Brown Arena |
| Tony Graham Recreation Complex-Kanata | Tony Graham Recreation Complex |
| Walter Baker Sports Centre | Walter Baker Sports Centre |
| West Carleton Community Complex | West Carleton Community Complex |
| W. Erskine Johnston Arena | W. Erskine Johnston Arena |

## Session Type

All sessions are `session_type: "ice_rental"` — these are individual bookable 1-hour ice rental time slots. This is a distinct type from `drop_in` (which is for hockey program drop-in sessions).

## Booking Window Note

The 15-day booking window is a reservation rule — users can only BOOK ice time within 15 days of the slot. However, the API returns `available: true` for all future unbooked slots, and **we scan and store the full range through August 31st** so users can see upcoming availability for planning purposes.

## Status Determination

| Status | Condition |
|--------|-----------|
| `available` | `times[].available === true` |

All extracted slots use status `available`. Unavailable slots (`available: false`) are not included in the scan output.

**Note:** The database enum only supports: `available`, `limited`, `waitlist`, `sold_out`. Do NOT use `upcoming` as a status value.

## Output Format

Present results grouped by arena/center, showing:
- Arena name with rink identifier
- Date and day of week
- Available time slots
- Direct booking link

Example:
```
## Bell Centennial Arena
- **Wed Feb 25** - 3:00 PM - 4:00 PM
- **Fri Feb 27** - 7:00 AM - 8:00 AM, 8:00 AM - 9:00 AM, 2:00 PM - 3:00 PM

## Brewer Arena
- **Thu Feb 26** - 9:00 AM - 10:00 AM, 10:00 AM - 11:00 AM
```

## Data Persistence

After scanning, save results to both local JSON and Supabase.

**CRITICAL:** The `start_date` field MUST be set for sessions to appear in the app. The edge function filters by `start_date >= first_of_month`, so sessions with NULL `start_date` won't show up. In the local JSON, always include `session_date` (ISO date) for each session -- the API uses it to set `start_date`. Also include `start_date` and `end_date` explicitly.

### Local JSON Audit Trail

Save to: `data/provider-scans/ottawa-ice-time/scan-{YYYY-MM-DD-HHmmss}.json`

```json
{
  "provider": "ottawa-ice-time",
  "scanned_at": "2026-02-22T20:00:00Z",
  "source_url": "https://anc.ca.apm.activecommunities.com/ottawa/reservation/search",
  "sessions": [
    {
      "program_name": "Ice Rental - Bell Centennial Arena (BLCA)",
      "session_type": "ice_rental",
      "session_date": "2026-02-25",
      "start_date": "2026-02-25",
      "end_date": "2026-02-25",
      "day_of_week": "Wednesday",
      "start_time": "15:00",
      "end_time": "16:00",
      "location": "Bell Centennial Arena",
      "status": "available",
      "source_url": "https://anc.ca.apm.activecommunities.com/ottawa/reservation/search/detail/2609",
      "price": null,
      "min_birth_year": null,
      "max_birth_year": null,
      "notes": "1-hour ice rental. Book at ottawa.ca or call (613) 828-9629."
    }
  ],
  "summary": {
    "total": 150,
    "by_status": { "available": 150 },
    "arenas_with_availability": 30,
    "date_range": "2026-02-22 to 2026-08-31"
  }
}
```

### Program Name Convention

Use the format: `Ice Rental - {Center Name} ({Rink Code})`

Where `{Rink Code}` is the short identifier from the facility name (e.g., "BLCA" from "BLCA-Arena Bell Centennial-LMI"). This distinguishes multi-rink facilities (e.g., "Ice Rental - Fred Barrett Arena (East Rink)" vs "(West Rink)").

For multi-rink facilities, use a human-readable rink name:
- Fred G. Barrett: "East Rink" / "West Rink"
- Bell Sensplex: "BrokerLink" / "CanadianTire" / "Myers Auto" / "MattamyHomes"
- Bob MacQuarrie: "Eliz.Manley" / "RogerSénécal"
- Jim Durrell: "Rink 01" / "Rink 02"
- Ray Friel: "Rink 02" / "Rink 03" / "Ron Racette"
- Richcraft Sensplex: "HEO" / "Potvin" / "CdnTire" / "CIBC"
- Minto Barrhaven: "North" / "South"
- Nepean Sportsplex: "A.MacDonald" / "Rink 03" / "S.Yzerman"
- CardelRec: "KatieXu/JackFan" / "Matt Bradley"
- Tony Graham: "Gary Burke" / "Tom Flood"
- Walter Baker: "Rink A" / "Rink B"

### Submit to API — Monthly Chunks

**CRITICAL: Submit one month at a time**, not the entire 6-month dataset at once. The full payload (~10MB+) is too large for a single API call.

For each month's slot data, build a session array and submit separately:

```javascript
// Build sessions for one month and submit
(async () => {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const slots = window.__marchSlots; // <-- change per month
  const sessions = slots.map(s => {
    const dow = days[new Date(s.date + 'T00:00:00').getDay()];
    return {
      program_name: `Ice Rental - ${s.center} (${s.rink})`,
      session_type: 'ice_rental', session_date: s.date, start_date: s.date, end_date: s.date,
      day_of_week: dow, start_time: s.st, end_time: s.et, location: s.center, status: 'available',
      source_url: `https://anc.ca.apm.activecommunities.com/ottawa/reservation/search/detail/${s.fid}`,
      price: null, min_birth_year: null, max_birth_year: null,
      notes: '1-hour ice rental. Book at ottawa.ca or call (613) 828-9629.'
    };
  });
  const arenas = new Set(sessions.map(s => s.location));
  const body = JSON.stringify({
    provider: 'ottawa-ice-time', scanned_at: new Date().toISOString(),
    source_url: 'https://anc.ca.apm.activecommunities.com/ottawa/reservation/search',
    sessions,
    summary: { total: sessions.length, by_status: { available: sessions.length }, arenas_with_availability: arenas.size, date_range: '2026-03-01 to 2026-03-31' }
  });
  const r = await fetch('https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans', {
    method: 'POST', headers: { 'x-api-key': 'pf-write-k8x7m2nQ9vR4', 'Content-Type': 'application/json' }, body
  });
  return `March: ${r.status} - ${(await r.text()).substring(0, 300)}`;
})()
```

Repeat for each month (April through August), changing the slot variable name and date range string.

**Note:** The provider `ottawa-ice-time` must exist in Supabase first. If the API returns 404, the provider needs to be created.

## Day of Week Calculation

Use JavaScript to determine the day of week:
```javascript
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOfWeek = days[new Date(dateString + 'T00:00:00').getDay()];
```

## Source URL

Each session's `source_url` should link directly to the facility's detail page:
```
https://anc.ca.apm.activecommunities.com/ottawa/reservation/search/detail/{facilityId}
```

## Notes

- Ice time availability changes rapidly (hourly). Scan data may become stale quickly.
- The API does not require authentication to VIEW availability, only to BOOK.
- Pricing is not available through the public API (requires login). Set `price: null`.
- The booking window for reservations is 24 hours to 15 days in advance, but we scan and store all availability through August 31st for planning visibility.
- All time slots are 1-hour blocks, booked on the hour.
- Facilities with names ending in "LMI" are Last-Minute Ice facilities.
- Some arenas have multiple rinks (e.g., Fred Barrett has East and West rinks) - each rink has its own facility ID and is queried separately.
- **Always query one month at a time** to avoid Chrome extension disconnects. Never query the full 6-month range in a single JavaScript call.
