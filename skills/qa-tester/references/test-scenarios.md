# Test Scenarios Reference

Each test scenario describes: what to do, how to extract data, and how to validate results.

## How to Randomly Pick Tests

Use this pool of 8 test types. For each test run, randomly select from this list (don't repeat
the same test type unless running more than 8 tests). Vary the specific filter values too —
e.g., don't always test "Drop-in", sometimes test "Camp" or "Series".

---

## Test 1: Session Type Filter

**Goal:** Verify that selecting a session type only shows sessions of that type.

**Steps:**
1. Go to `https://nepeanpuckfinder.com`
2. Click one of: Drop-in, Clinic, Series, Camp, or Ice Rental
3. Click "Skip — any age" on the birth year screen
4. Click "Skip — any date" on the date screen (or just click Next to accept defaults)
5. Click Next on the arena screen (leave all unchecked = all arenas)
6. Click "Skip for now" on the email screen
7. You're now on the results page filtered to that session type

**Data extraction:** Use JavaScript or `read_page` to get all session cards. Each card has a
session type badge (top-right corner). The badge text should match the filter.

**Validation:**
- Every session card's badge text must match the selected session type
- FAIL if any badge shows a different type (e.g., badge says "Camp" when filtered to "Drop-in")
- WARNING if a badge says "Other" — this may be a classification gap rather than a filter bug

**Randomization:** Pick randomly from: Drop-in, Clinic, Series, Camp, Ice Rental

---

## Test 2: Provider Filter

**Goal:** Verify that unchecking providers removes their sessions from results.

**Steps:**
1. Navigate to results page (go through wizard quickly — use any session type, skip age/date)
2. On the results page, click the providers dropdown in the nav bar
3. Uncheck all providers, then check only 1 or 2 specific ones
4. Close the dropdown and wait for results to update

**Data extraction:** Each session card shows the provider name in the detail line (e.g.,
"4:00 PM · Fred Barrett Arena · **Apex Hockey Ottawa**"). Extract this from all visible cards.

**Validation:**
- Every session's provider name must be one of the selected providers
- FAIL if a session from an unchecked provider appears
- Count sessions and verify the count looks reasonable

**Randomization:** Pick 1-2 random providers from: Amped Sports, Apex Hockey Ottawa, Ashley
Holmes Training, City of Ottawa, Nepean Hockey School, Next Generation Hockey, Perfect Skating
Ottawa, Sensplex

---

## Test 3: Arena Filter

**Goal:** Verify that selecting specific arenas only shows sessions at those arenas.

**Steps:**
1. Go through the wizard, and on step 4 (arena selection), check only 1-2 specific arenas
2. Continue to results page
3. Alternatively: go to results page and use the "All Arenas" dropdown to filter

**Data extraction:** Each session card shows the arena in the detail line (e.g.,
"4:00 PM · **Fred Barrett Arena** · Apex Hockey Ottawa").

**Validation:**
- Every session's arena must be one of the selected arenas
- FAIL if a session at a non-selected arena appears
- The arena name in the card must exactly match (or be a reasonable variant of) the arena name
  in the filter checkbox

**Randomization:** Pick 1-2 random arenas from the available list. Use arenas that had non-zero
counts if possible.

---

## Test 4: Age/Birth Year Filter

**Goal:** Verify that selecting a birth year shows only age-appropriate sessions.

**Steps:**
1. Go to `https://nepeanpuckfinder.com`
2. Select any session type (e.g., Drop-in)
3. On the birth year screen, click a specific birth year (e.g., 2015/U11)
4. Note the matching session count shown
5. Continue through wizard to results

**Data extraction:** This is the hardest to validate because age eligibility lives in the
backend data, not always visible on the card. What you CAN check:
- Session names sometimes include age indicators (e.g., "U13", "U9/U11", birth year ranges)
- If a session name explicitly says "U18" or "2008-2009", it should only appear for birth
  years in that range

**Validation:**
- If a session name explicitly includes a U-age label (like "U13" or "U15/U18"), verify:
  - The selected birth year falls within the session's age range
  - U-age to birth year conversion: `birth_year = 2026 - U_number`
  - Example: If user selected 2015 (U11), a session labeled "U15/U18" (birth years 2008-2011)
    should NOT appear — FAIL
  - Example: If user selected 2015 (U11), a session labeled "U9/U11" (birth years 2015-2017)
    SHOULD appear — PASS
- If a session name has no age indicator, it's a PASS (might be open to all ages)
- WARNING if many sessions with no age indicators appear — might indicate the filter isn't
  actually filtering

**Randomization:** Pick a random birth year from: 2008, 2009, 2010, 2011, 2012, 2013, 2014,
2015, 2016, 2017

---

## Test 5: Session Count Consistency

**Goal:** Verify the "X matching sessions" count matches reality.

**Steps:**
1. Go through the wizard with any filter combination
2. Note the "X matching sessions" text shown at bottom of each wizard step
3. On the results page, count the actual session cards by scrolling through

**Data extraction:** Use JavaScript to:
- Read the count from the wizard or nav bar
- Count all session card elements in the DOM (they may be `<a>` tags or `<div>` wrappers)

**Validation:**
- The displayed count should match the number of session cards (within reason — if the page
  paginates or lazy-loads, the initial DOM count may be lower)
- FAIL if the count is significantly different (e.g., says "102 sessions" but only 5 are shown
  and no lazy loading is happening)
- WARNING if off by a small number (could be timing/loading issue)

**Note:** Scroll all the way to the bottom to trigger any lazy loading before counting.

---

## Test 6: Cross-Filter Combo

**Goal:** Apply multiple filters and verify ALL are respected simultaneously.

**Steps:**
1. Go through the wizard selecting a specific session type AND a specific birth year
2. On the results page, additionally filter by a specific provider via the dropdown
3. Wait for results to update

**Data extraction:** Extract session type badge, provider name, and (if possible) age indicators
from all visible sessions.

**Validation:**
- Every session must pass ALL active filter checks:
  - Session type badge matches selected type
  - Provider name matches selected provider(s)
  - Age range (if visible in name) is compatible with selected birth year
- FAIL if any session violates any one of the active filters

**Randomization:** Pick a random combo, for example:
- Drop-in + birth year 2013 + provider Apex Hockey Ottawa
- Series + birth year 2015 + provider Nepean Hockey School
- Clinic + any age + provider Amped Sports

---

## Test 7: Duplicate Detection

**Goal:** Check for duplicate session cards on the same date.

**Steps:**
1. Go to results page with a broad filter (e.g., "Select All" session types, any age, all arenas)
2. Scroll through the results

**Data extraction:** For each session card, create a signature from:
`session_name + date + time + arena`

**Validation:**
- No two cards on the same date should have an identical signature
- FAIL if exact duplicates are found (same name, same date, same time, same arena)
- WARNING if near-duplicates exist (same name and date but different times — could be
  legitimate different sessions)

---

## Test 8: Session Type Badge Consistency

**Goal:** Verify badges are present and contain valid values.

**Steps:**
1. Go to results page with "Select All" session types (or go through wizard without selecting
   a specific type — this might not be possible, so just pick any type)
2. Examine all session cards

**Data extraction:** Read the badge text from every session card.

**Validation:**
- Every session card should have a visible session type badge
- The badge text should be one of the known types: Drop-in, Clinic, Series, Camp, Ice Rental, Other
- FAIL if a session card has no badge at all
- FAIL if the badge text is something unexpected (misspelling, wrong label, etc.)
- WARNING if many sessions show "Other" — might indicate a classification gap

---

## JavaScript Helpers

### Extract all session cards from results page

```javascript
// Get all session card links on the results page
const cards = document.querySelectorAll('a[href*="leagueapps"], a[href*="uplifter"], a[href*="nepeanhockeyschool"], a[href*="ampedsports"], a[class*="session"], a[class*="card"]');

// Alternative: look for the session card container pattern
// Session cards typically have a consistent structure with title, date, details, and badge
const allLinks = document.querySelectorAll('main a, [class*="session"] a, [class*="card"]');
```

Note: The exact selectors may vary. Use `read_page` first to understand the DOM structure,
then write targeted extraction JavaScript. The session cards on the results page are clickable
links that contain:
- A bold title (session name)
- Date text
- A detail line with time, arena, and provider separated by " · "
- A badge element with the session type

### Parse a session card's details

The detail line format is: `TIME · ARENA · PROVIDER`

Split on " · " to get the three components. The badge is typically in a separate element
positioned at the top-right of the card.
