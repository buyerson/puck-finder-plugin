---
name: nepean-hockey-school
description: >
  Check Nepean Hockey School (James White) program availability and sync to Puck Finder.
  Use when the user says "check nepean hockey", "nepean hockey school", "james white hockey",
  "check james white", or asks about hockey programs, drop-in sessions, or availability at
  Nepean Hockey School. Also trigger when the user asks to scan hockey providers and Nepean
  Hockey School is one of them.
version: 0.2.0
---

# Nepean Hockey School Program Checker

Scan https://nepeanhockeyschool.com/available-sessions/ for available hockey sessions, determine availability status via color-coded text, display results, and persist scan data locally and to the Puck Finder API.

## Chrome Extension Required

This skill requires the Claude in Chrome browser extension because the website uses text color to signal availability (red = sold out, orange = limited, etc.). Plain HTTP fetching can't detect these colors.

Before starting, verify the extension is available by calling `mcp__Claude_in_Chrome__tabs_context_mcp`. If unavailable, tell the user:

> "This skill needs the Claude in Chrome browser extension to detect color-coded availability on the Nepean Hockey School website. Please make sure the extension is running and try again."

Do not fall back to WebFetch or curl -- they cannot read computed text styles.

## Workflow

1. Verify Chrome extension availability (`mcp__Claude_in_Chrome__tabs_context_mcp`)
2. Create a new tab and navigate to https://nepeanhockeyschool.com/available-sessions/
3. Wait for the page to load, then extract session data with color information using the JavaScript in `references/extraction.md`
4. Classify each session's availability based on color and text indicators
5. Present results to the user organized by status
6. Persist results: save a local JSON file and submit to the Puck Finder API via curl

## Color-Based Status Detection

The website uses `<span>` text color inside table cells to communicate availability. The color is not visible in DOM text -- you must query computed styles with JavaScript.

| Status | RGB Value | Visual | Meaning |
|--------|-----------|--------|---------|
| `sold_out` | `rgb(255, 0, 0)` | Red | Session is full |
| `limited` | `rgb(255, 153, 0)` | Orange | Few spots left |
| `special_event` | `rgb(255, 255, 0)` | Yellow | Special event -- check for "(FULL)" text |
| `available` | `rgb(0, 0, 0)` | Black | Open for registration |

Additional text-based indicators override or supplement color:
- "(FULL)" anywhere in the arena column means sold out regardless of color
- "Space is Limited" or "Limited" in the session column means limited availability (unless already sold out)

Read `references/extraction.md` for the JavaScript extraction code.

## Session Types

**Regular Power Edge sessions** (typically Tuesdays at 4:15 PM at Walter Baker):
- Power Edge + Speed
- Power Edge + Edge Control
- Power Edge + Puck Handling
- Power Edge + Hockey Drills

**Special events** (Family Day, PD Day, March Break, guest instructors):
- Train 2.0 Downhill Skating (guest instructor Kevin McKinnon)
- Family Day / PD Day programs
- Team training and scrimmage sessions

**Formats:**
- Low Ratio 4:1 -- premium small-group training (typically $90)
- Standard group sessions
- Guest instructor sessions (e.g., Kevin McKinnon -- $50)

## Session Type Classification

Every session must include a `session_type`. Use these rules:

| Type | When to use |
|------|-------------|
| `drop_in` | Regular weekly Power Edge sessions (each individually bookable), Open Scrimmage |
| `clinic` | Special event days (Family Day, PD Day), Train 2.0 Downhill Skating, guest instructor one-offs |
| `camp` | Multi-day consecutive programs (rare for this provider) |
| `series` | Weekly recurring packages (rare -- sessions are listed individually) |
| `unknown` | Cannot determine |

## Locations

Programs run at multiple Ottawa venues: Walter Baker Sports Centre, Fred Barrett Arena, Minto Recreation Complex, Cardel Rec Complex, Pinecrest Recreation Complex.

## Output Format

Organize sessions into two groups:

**Available** (status: `available` or `limited`) -- show these first, with date, session type, time, arena, price, status, and any special notes.

**Sold Out** (status: `sold_out`) -- list briefly at the end.

Flag special events (guest instructors, low ratio, holiday programs) with extra detail.

## Data Persistence

After displaying results, persist the scan data. Read `references/persistence.md` for the JSON schema and API submission details.

### Local JSON

Save the scan JSON to the working directory.

### API Submission

Submit the scan JSON to the Puck Finder API using curl. See `references/persistence.md` for the curl command, payload schema, and API key.
