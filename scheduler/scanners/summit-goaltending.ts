#!/usr/bin/env bun
// Headless scanner for summit-goaltending.
//
// Summit's schedule is hand-curated by Andrew on a single Wix page. The
// content IS server-rendered (despite the "requires Chrome" note on the
// existing skill), so we can curl it and pull the schedule block with a
// regex pass.
//
// The schedule changes seasonally (Andrew updates the page when the season
// rolls). We detect the season string and use it for start/end_date.
//
// Run with: bun run scheduler/scanners/summit-goaltending.ts

const PAGE_URL = "https://www.summitgoaltending.ca/services-7";
const SCANS_API = "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans";
const WRITE_KEY = process.env.PUCK_FINDER_WRITE_KEY || "pf-write-k8x7m2nQ9vR4";
const PROVIDER = "summit-goaltending";

// Andrew runs all sessions at Amped SportsLab. The arena exists in the DB.
const LOCATION = "Amped Sports Lab";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_IDX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

type Session = {
  program_name: string;
  session_type: "series" | "drop_in";
  session_date: string;
  start_date: string;
  end_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string;
  status: "available";
  source_url: string;
  min_birth_year: number | null;
  max_birth_year: number | null;
  notes: string;
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function fmtDate(d: Date) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }

// Project the next concrete occurrence of `dayOfWeek` on or after `from`.
function nextOccurrence(from: Date, dayOfWeek: string): Date {
  const target = DOW_IDX[dayOfWeek];
  if (target === undefined) throw new Error(`unknown day: ${dayOfWeek}`);
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const diff = (target - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function parseTime12(s: string): { h: number; m: number } {
  // "6:00pm" / "10:00am" / "2:00pm"
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (!m) throw new Error(`bad time: ${s}`);
  let h = parseInt(m[1]!, 10);
  const mn = parseInt(m[2]!, 10);
  const ap = m[3]!.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { h, m: mn };
}

function parseBirthYears(raw: string): { min: number | null; max: number | null } {
  // "2015-2019" or "2013-2008" (sometimes backwards)
  const m = raw.match(/(\d{4})\s*-\s*(\d{4})/);
  if (!m) return { min: null, max: null };
  const a = parseInt(m[1]!, 10);
  const b = parseInt(m[2]!, 10);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function parseSeason(html: string, today: Date): { start: string; end: string; label: string } {
  // "Winter/SpringSessions (February 1st- June 30th)" or similar
  const m = html.match(/([A-Z][a-z]+\/?[A-Z]?[a-z]*)\s*Sessions?\s*\(([A-Z][a-z]+\.?\s*\d{1,2}(?:st|nd|rd|th)?)\s*[-–]\s*([A-Z][a-z]+\.?\s*\d{1,2}(?:st|nd|rd|th)?)\)/);
  if (!m) {
    // Fall back: end-of-quarter
    const year = today.getUTCFullYear();
    return { start: fmtDate(today), end: `${year}-12-31`, label: `${year} (no season parsed)` };
  }
  const label = m[1]!.replace(/Sessions$/, "");
  const year = today.getUTCFullYear();
  const start = parseSeasonDate(m[2]!, year);
  let end = parseSeasonDate(m[3]!, year);
  // If end < start, the season wraps to next year.
  if (end < start) end = parseSeasonDate(m[3]!, year + 1);
  return { start, end, label };
}

function parseSeasonDate(piece: string, year: number): string {
  const m = piece.match(/([A-Z][a-z]+)\.?\s*(\d{1,2})/);
  if (!m) throw new Error(`bad season date: ${piece}`);
  const mo = MONTHS[m[1]!.toLowerCase()];
  if (!mo) throw new Error(`bad season month: ${piece}`);
  return `${year}-${pad(mo)}-${pad(parseInt(m[2]!, 10))}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function main() {
  const r = await fetch(PAGE_URL);
  if (!r.ok) throw new Error(`page fetch failed: ${r.status}`);
  const html = await r.text();
  const text = stripHtml(html);

  // Extract the schedule region. Bounded between the first "Small Group"
  // mention and the season string.
  const start = text.indexOf("Small Group");
  if (start < 0) throw new Error("schedule region not found in page");
  const end = text.indexOf("Sessions (", text.indexOf(")", start));
  const schedule = text.slice(start, end > start ? end : start + 1200);

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const season = parseSeason(text, todayUtc);
  console.log(`Season: ${season.label} ${season.start} → ${season.end}`);

  const sessions: Session[] = [];

  // Pattern 1: "Small Group Sessions (Thursdays) 6:00pm U10/U12 (2015-2019 birth years) 7:00pm U13/U16 ... 8:00pm U15/U18 ..."
  const smallGroupBlock = schedule.match(/Small Group Sessions?\s*\((\w+)s?\)([\s\S]*?)(?=Semi Private|$)/i);
  if (smallGroupBlock) {
    const dow = smallGroupBlock[1]!.replace(/s$/, "");
    const blk = smallGroupBlock[2]!;
    const slotRe = /(\d{1,2}:\d{2}[ap]m)\s+(U\d+\/U\d+)\s*\((\d{4}-\d{4})\s*birth years\)/gi;
    for (const m of blk.matchAll(slotRe)) {
      const { h, m: mn } = parseTime12(m[1]!);
      const ages = m[2]!;
      const years = parseBirthYears(m[3]!);
      const startTime = `${pad(h)}:${pad(mn)}`;
      const endTime = `${pad(h + 1)}:${pad(mn)}`;
      const first = nextOccurrence(todayUtc, dow);
      sessions.push({
        program_name: `Small Group Session - ${ages} (${dow}s ${m[1]!})`,
        session_type: "series",
        session_date: fmtDate(first),
        start_date: fmtDate(first),
        end_date: season.end,
        day_of_week: dow,
        start_time: startTime,
        end_time: endTime,
        location: LOCATION,
        status: "available",
        source_url: PAGE_URL,
        min_birth_year: years.min,
        max_birth_year: years.max,
        notes: `Season: ${season.label} ${season.start}–${season.end}`,
      });
    }
  }

  // Pattern 2: "Semi Private Sessions (Saturdays) 10:00am U13/U18 (2013-2008 birth years) 11:00am U13/U18 ..."
  const semiPrivateBlock = text.match(/Semi Private Sessions?\s*\((\w+)s?\)([\s\S]*?)(?=Weekday|Private|Winter|Spring|Summer|Fall|$)/i);
  if (semiPrivateBlock) {
    const dow = semiPrivateBlock[1]!.replace(/s$/, "");
    const blk = semiPrivateBlock[2]!;
    const slotRe = /(\d{1,2}:\d{2}[ap]m)\s+(U\d+\/U\d+)\s*\((\d{4}-\d{4})\s*birth years\)/gi;
    for (const m of blk.matchAll(slotRe)) {
      const { h, m: mn } = parseTime12(m[1]!);
      const ages = m[2]!;
      const years = parseBirthYears(m[3]!);
      const startTime = `${pad(h)}:${pad(mn)}`;
      const endTime = `${pad(h + 1)}:${pad(mn)}`;
      const first = nextOccurrence(todayUtc, dow);
      sessions.push({
        program_name: `Semi Private Session - ${ages} (${dow}s ${m[1]!})`,
        session_type: "series",
        session_date: fmtDate(first),
        start_date: fmtDate(first),
        end_date: season.end,
        day_of_week: dow,
        start_time: startTime,
        end_time: endTime,
        location: LOCATION,
        status: "available",
        source_url: PAGE_URL,
        min_birth_year: years.min,
        max_birth_year: years.max,
        notes: `Season: ${season.label} ${season.start}–${season.end}`,
      });
    }
  }

  // Pattern 3: "Weekday Semi Private Sessions Wednesdays at 2:00pm U13/U18 (2013-2008 birth years)"
  const weekdayBlock = text.match(/Weekday Semi Private Sessions?\s*(\w+)s?\s+at\s+(\d{1,2}:\d{2}[ap]m)\s+(U\d+\/U\d+)\s*\((\d{4}-\d{4})\s*birth years\)/i);
  if (weekdayBlock) {
    const dow = weekdayBlock[1]!.replace(/s$/, "");
    const time = weekdayBlock[2]!;
    const ages = weekdayBlock[3]!;
    const years = parseBirthYears(weekdayBlock[4]!);
    const { h, m: mn } = parseTime12(time);
    const startTime = `${pad(h)}:${pad(mn)}`;
    const endTime = `${pad(h + 1)}:${pad(mn)}`;
    const first = nextOccurrence(todayUtc, dow);
    sessions.push({
      program_name: `Weekday Semi Private Session - ${ages} (${dow}s ${time})`,
      session_type: "series",
      session_date: fmtDate(first),
      start_date: fmtDate(first),
      end_date: season.end,
      day_of_week: dow,
      start_time: startTime,
      end_time: endTime,
      location: LOCATION,
      status: "available",
      source_url: PAGE_URL,
      min_birth_year: years.min,
      max_birth_year: years.max,
      notes: `Season: ${season.label} ${season.start}–${season.end}`,
    });
  }

  // Private sessions are "Available Upon Request" — we don't insert a row
  // for those because they have no concrete date/time. Surfacing them in
  // PuckFinder would be misleading.
  console.log(`Parsed ${sessions.length} session(s)`);

  if (sessions.length === 0) {
    console.error("SCAN_FAILED no sessions parsed — page format may have changed");
    process.exit(1);
  }

  const allDates = sessions.map((s) => s.start_date).sort();
  const payload = {
    provider: PROVIDER,
    scanned_at: new Date().toISOString(),
    source_url: PAGE_URL,
    scan_date_start: allDates[0],
    scan_date_end: allDates[allDates.length - 1],
    sessions,
    summary: {
      total: sessions.length,
      by_status: { available: sessions.length, sold_out: 0 },
    },
  };

  const submitRes = await fetch(SCANS_API, {
    method: "POST",
    headers: { "x-api-key": WRITE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseText = await submitRes.text();
  if (!submitRes.ok) {
    console.error(`SCAN_FAILED status=${submitRes.status} body=${responseText.slice(0, 500)}`);
    process.exit(1);
  }
  const data = JSON.parse(responseText);
  const d = data.data ?? {};
  console.log(
    `SCAN_COMPLETE provider=${PROVIDER} upserted=${d.sessions_upserted ?? "?"} added=${(d.sessions_added ?? []).length} status_changed=${(d.sessions_status_changed ?? []).length} archived=${(d.sessions_archived ?? []).length} dropped_past=${d.sessions_dropped_past ?? 0} unresolved=${(d.unresolved_locations ?? []).length}`,
  );
}

main().catch((err) => {
  console.error(`SCAN_FAILED ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
