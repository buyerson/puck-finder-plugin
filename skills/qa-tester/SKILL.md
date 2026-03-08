---
name: qa-tester
description: >
  Run QA tests on the Nepean Puckfinder web app (nepeanpuckfinder.com) to find data
  inconsistencies, filter bugs, and display issues. Use when the user says "test puck finder",
  "qa puck finder", "test the app", "check for bugs", "run puck finder tests", or asks about
  testing or quality-checking the Puck Finder website. Also trigger when the user mentions
  "smoke test", "regression test", or "sanity check" in the context of Puck Finder.
---

# Puck Finder QA Tester

Automated QA agent that navigates https://nepeanpuckfinder.com, applies different filter
combinations, and validates that the displayed results are consistent with the selected filters.

## Chrome Extension Required

This skill requires the Claude in Chrome browser extension. Before starting, verify by calling
`mcp__Claude_in_Chrome__tabs_context_mcp`. If unavailable, tell the user the Chrome extension
is needed and stop.

## What This Skill Tests

The Puck Finder app lets parents search for kids' hockey sessions in Ottawa. It has a wizard
flow (session type > birth year > date range > arena) and a results page with filter dropdowns
in the nav bar. This skill tests that filters actually work — that the results shown match
what was requested.

### The App Structure

**Home page** (`nepeanpuckfinder.com`): Wizard with 4 steps:
1. **Session type**: Drop-in, Clinic, Series, Camp, Ice Rental
2. **Birth year/age**: 2008/U18 through 2017/U9, plus "Skip — any age"
3. **Date range**: Slider from earliest to latest available dates, plus "Skip — any date"
4. **Arena**: Checkboxes for all arenas with session counts, plus search

**Results page** (`/today`): Shows session cards grouped by date, with nav-bar filter dropdowns:
- **Providers**: Multi-select checkboxes (Amped Sports, Apex Hockey Ottawa, Ashley Holmes Training, City of Ottawa, Nepean Hockey School, Next Generation Hockey, Perfect Skating Ottawa, Sensplex)
- **Arenas**: Multi-select checkboxes with session counts
- **Session type**: Single-select (Camp, Drop-in, Series, Clinic, Ice Rental, Other)
- **Date range**: Date picker
- **Ages**: Filter by child (requires account)
- **Views**: Month, Week, Today

**Session card anatomy**: Each card shows:
- Session name (bold title)
- Date line (e.g., "Mon, Mar 2")
- Detail line: time + arena + provider name
- Session type badge (top-right, e.g., "Drop-in")
- Provider logo (left side)

## How to Run Tests

By default, run **5 random tests** each invocation. If the user specifies a different number,
use that instead. If the user asks for a specific test type, run only that type.

### Test Execution Flow

For each test:

1. **Navigate fresh** to `https://nepeanpuckfinder.com` (start from the home page each time
   to ensure clean filter state)
2. **Select a random test scenario** from the test pool (see `references/test-scenarios.md`)
3. **Apply the filters** through the wizard or nav-bar dropdowns
4. **Wait for results to load** (watch for the session count to appear/update)
5. **Extract all visible session data** using JavaScript (read the DOM)
6. **Validate every session** against the applied filters
7. **Record findings**: passes, failures, and anomalies

### Extracting Session Data

After filters are applied and results are loaded, use JavaScript to extract session cards from
the DOM. Each session card contains:
- The session title (program name)
- The date
- The time, arena, and provider (from the detail line)
- The session type badge text

Use `read_page` or `javascript_tool` to extract all visible sessions. Scroll down to ensure
you capture sessions below the fold — the page may have many results. Extract at least the
first 20 sessions (or all if fewer than 20).

### Skipping the Email Prompt

When going through the wizard, after the arena selection step there's a "Stay in the loop"
email signup screen. Always click **"Skip for now"** to bypass it.

## Test Scenarios

Read `references/test-scenarios.md` for the full list of test types and their validation logic.
Pick randomly from these categories:

1. **Session Type Filter** — select a session type, verify all results show the matching badge
2. **Provider Filter** — select specific providers, verify only those providers appear in results
3. **Arena Filter** — select specific arenas, verify results only show sessions at those arenas
4. **Age/Birth Year Filter** — select a birth year through the wizard, verify session names
   and age ranges are appropriate (this is the trickiest one — some sessions span multiple
   age groups, so the selected birth year should fall within the session's range)
5. **Session Count Consistency** — compare the "X matching sessions" count shown in the UI
   with the actual number of session cards rendered
6. **Cross-Filter Combo** — apply 2+ filters simultaneously and verify all are respected
7. **Duplicate Detection** — look for identical session cards (same name, date, time, arena)
   appearing multiple times on the same date
8. **Session Type Badge Consistency** — verify that the badge text on each card matches the
   session type filter that's currently active

## Reporting Results

After all tests complete, present a clear report:

### Report Format

```
## Puck Finder QA Report — [date]

**Tests run:** X | **Passed:** Y | **Failed:** Z | **Warnings:** W

### Test 1: [Test Type] — [PASS/FAIL/WARNING]
**Filter applied:** [what was selected]
**Sessions checked:** [count]
**Result:** [what happened]
[If failed: specific details about which sessions violated the filter]

### Test 2: ...
[repeat for each test]

### Summary
[Overall assessment: any patterns in failures, severity, recommendations]
```

### Severity Levels

- **FAIL**: A session clearly violates the active filter (e.g., a "Camp" session appearing
  when filtered to "Drop-in" only). This is a definite bug.
- **WARNING**: Something looks suspicious but might be expected (e.g., a session with no age
  info showing up in an age-filtered view — it could be intentional "show for all ages" behavior).
- **PASS**: All sessions checked are consistent with the applied filter.

## Important Notes

- Always start each test from the home page to get a clean filter state
- Don't enter any email addresses or create accounts
- If the app is slow to load, wait up to 10 seconds before declaring a timeout
- If a filter combination returns zero results, that's not a bug — note it and move on
- Some sessions legitimately span multiple age groups — account for this in age filter tests
- The "matching sessions" count sometimes includes sessions below the fold; scroll to verify
- Take screenshots as evidence when you find failures
