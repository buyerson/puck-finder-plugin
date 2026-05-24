#!/usr/bin/env bun
// Headless scanner for perfect-skating-ottawa.
//
// Replaces the Chrome-driven LLM skill with a deterministic HTTP scrape:
//   1. GET /collections/all/products.json?limit=250 — public Shopify endpoint
//      returns every product (including variants + inventory_quantity) in
//      one shot, no auth.
//   2. Parse variant title strings into sessions. Variant titles encode
//      date / time / location across 4 formats — see parseVariant() below.
//   3. POST normalized payload to puck-finder-api/scans.
//
// Why pure-HTTP instead of the LLM skill: Shopify exposes everything via
// JSON, so there's nothing for an LLM to "interpret". The Chrome boot +
// Claude Code session were ~180s of overhead for what is a 5-second HTTP
// scrape with a regex pass.
//
// Run with: bun run scheduler/scanners/perfect-skating.ts
// Outputs: prints scan summary to stdout, exits 0 on success / non-zero on
// any error so launchd surfaces failures.

const COLLECTION_URL = "https://ottawa.perfectskating.ca/collections/all/products.json?limit=250";
const SOURCE_URL = "https://ottawa.perfectskating.ca/collections/all";
const PRODUCT_URL = (handle: string) => `https://ottawa.perfectskating.ca/products/${handle}`;
const SCANS_API = "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans";
const WRITE_KEY = process.env.PUCK_FINDER_WRITE_KEY || "pf-write-k8x7m2nQ9vR4";

// Variant title encodes location strings using short names that need to map
// to the canonical arena names already in the DB.
const LOCATION_MAP: Record<string, string> = {
  "carleton u": "Carleton University Ice House",
  "bell sensplex": "Bell Sensplex",
  "richcraft sensplex": "Richcraft Sensplex",
  "minto barrhaven": "Minto Recreation Complex",
  "minto rec complex": "Minto Recreation Complex",
  "ray friel": "Ray Friel Recreation Complex",
  "walter baker": "Walter Baker Sports Centre",
  "tony graham rec complex": "Tony Graham Recreation Complex",
  "tony graham": "Tony Graham Recreation Complex",
  "jim durrell": "Jim Durrell Recreation Centre",
  "cardel rec complex": "Cardel Rec Complex",
  "cardel": "Cardel Rec Complex",
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const DAYS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", tues: "Tuesday", wed: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", fri: "Friday",
  sat: "Saturday", sun: "Sunday",
};

type Variant = {
  title: string;
  price: string;
  // The /collections/all/products.json endpoint exposes a boolean `available`
  // instead of the `inventory_quantity` integer that individual /products/X.json
  // returns. We only need the binary status, so `available` is enough.
  available: boolean;
};

type Product = {
  handle: string;
  title: string;
  variants: Variant[];
};

type Session = {
  program_name: string;
  session_type: "camp" | "series" | "clinic";
  session_date: string | null;
  start_date: string | null;
  end_date: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  price: number;
  status: "available" | "sold_out";
  source_url: string;
  notes: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseMonth(s: string | undefined): number | null {
  if (!s) return null;
  const k = s.toLowerCase().replace(/\.$/, "");
  if (MONTHS[k]) return MONTHS[k];
  const short = k.slice(0, 3);
  return MONTHS[short] ?? null;
}

function parseYearFromTitle(title: string): number {
  const m = title.match(/(20\d{2})/);
  return m ? parseInt(m[1]!, 10) : new Date().getFullYear();
}

function parseDateRange(s: string, year: number): { start: string; end: string } | null {
  if (!s) return null;
  let str = s.trim()
    .replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+/i, "")
    .replace(/first session only/i, "")
    .trim();

  // "Apr 20 - May 25" (cross-month)
  let m = str.match(/([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?/);
  if (m) {
    const sm = parseMonth(m[1]);
    const em = parseMonth(m[3]);
    if (sm && em) {
      return { start: fmtDate(year, sm, parseInt(m[2]!, 10)), end: fmtDate(year, em, parseInt(m[4]!, 10)) };
    }
  }

  // "Apr 20 - 25" (same month)
  m = str.match(/([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?/);
  if (m) {
    const sm = parseMonth(m[1]);
    if (sm) return { start: fmtDate(year, sm, parseInt(m[2]!, 10)), end: fmtDate(year, sm, parseInt(m[3]!, 10)) };
  }

  // "Apr 20" (single day)
  m = str.match(/([A-Za-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?/);
  if (m) {
    const sm = parseMonth(m[1]);
    if (sm) {
      const d = fmtDate(year, sm, parseInt(m[2]!, 10));
      return { start: d, end: d };
    }
  }
  return null;
}

function parseTime(s: string): { start: string; end: string | null } | null {
  if (!s) return null;
  const str = s.trim();
  // "6:30am-7:30am" or "6:30am - 7:30am" or "6:30-7:30am"
  let m = str.match(/(\d{1,2}):(\d{2})\s*([ap]m)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (m) {
    let h1 = parseInt(m[1]!, 10);
    const mn1 = parseInt(m[2]!, 10);
    const ap1 = (m[3] ?? m[6]!).toLowerCase();
    if (ap1 === "pm" && h1 < 12) h1 += 12;
    if (ap1 === "am" && h1 === 12) h1 = 0;
    let h2 = parseInt(m[4]!, 10);
    const mn2 = parseInt(m[5]!, 10);
    const ap2 = m[6]!.toLowerCase();
    if (ap2 === "pm" && h2 < 12) h2 += 12;
    if (ap2 === "am" && h2 === 12) h2 = 0;
    return { start: `${pad(h1)}:${pad(mn1)}`, end: `${pad(h2)}:${pad(mn2)}` };
  }
  // "6:30am"
  m = str.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (m) {
    let h = parseInt(m[1]!, 10);
    const mn = parseInt(m[2]!, 10);
    const ap = m[3]!.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return { start: `${pad(h)}:${pad(mn)}`, end: null };
  }
  return null;
}

function parseDayOfWeek(s: string | undefined): string | null {
  if (!s) return null;
  const k = s.trim().toLowerCase().replace(/[.']s?$/, "").replace(/s$/, "");
  if (DAYS[k]) return DAYS[k]!;
  if (DAYS[k.slice(0, 3)]) return DAYS[k.slice(0, 3)]!;
  const m = k.match(/(mon|tues?|wed|thur?s?|fri|sat|sun)/);
  return m ? (DAYS[m[1]!] ?? null) : null;
}

function mapLocation(s: string): string {
  const raw = s.trim();
  const stripped = raw.toLowerCase().replace(/\(.*?\)/g, "").trim();
  return LOCATION_MAP[stripped] ?? raw.replace(/\(.*?\)/g, "").trim();
}

function classifySessionType(title: string): "camp" | "series" | "clinic" {
  const t = title.toLowerCase();
  if (t.includes("1-week") || t.includes("1 week")) return "camp";
  if (t.includes("specialty") || t.includes("clinic")) return "clinic";
  return "series";
}

function startsWithLoc(s: string): boolean {
  const ls = s.toLowerCase();
  for (const k of Object.keys(LOCATION_MAP)) {
    if (ls.startsWith(k)) return true;
  }
  return false;
}

// Variant titles come in 4 shapes:
//   A. "<Location> (<DAY>) / <Time> (<Date>)"
//      e.g. "Carleton U (MON) / 6:30am (Sept. 11th)"
//   B. "<DateRange> (<Days>) / <Location> / <TimeRange>"
//      e.g. "July 13-17 (Mon-Fri) / Bell Sensplex / 8:15am-10:15am"
//   C. "<DateRange> / <Location> (<DAYS>) / <TimeRange>"
//      e.g. "July 6-Aug 8th / Bell Sensplex (MONDAYS) / 5:15pm-7:15pm"
//   D. "<Day> <Date> / <Location> (<Skill>) / <Time>" (specialty clinics)
//      e.g. "Friday Mar. 27th / Ray Friel (Evasive Skating) / 6:15am"
//   D'. "<Day> <Date> / <Time> / <Location> (<Skill>)"  -- newer order
function parseVariant(product: Product, variant: Variant): Session {
  const title = variant.title;
  const parts = title.split("/").map((p) => p.trim());
  const year = parseYearFromTitle(product.title);

  const s: Session = {
    program_name: product.title,
    location: null,
    day_of_week: null,
    start_time: null,
    end_time: null,
    session_date: null,
    start_date: null,
    end_date: null,
    price: parseFloat(variant.price),
    status: variant.available ? "available" : "sold_out",
    source_url: PRODUCT_URL(product.handle),
    notes: title,
    session_type: classifySessionType(product.title),
  };

  const p0 = parts[0] ?? "";
  const p1 = parts[1] ?? "";
  const p2 = parts[2] ?? "";

  // Format A
  if (startsWithLoc(p0) && !/\d/.test(p0.replace(/\(.*?\)/g, ""))) {
    const dm = p0.match(/\(([^)]+)\)/);
    s.day_of_week = dm ? parseDayOfWeek(dm[1]) : null;
    s.location = mapLocation(p0);
    const tm = parseTime(p1.replace(/\(.*?\)/g, "").trim());
    if (tm) {
      s.start_time = tm.start;
      s.end_time = tm.end;
    }
    const ddm = p1.match(/\(([^)]+)\)/);
    if (ddm) {
      const dr = parseDateRange(ddm[1]!, year);
      if (dr) {
        s.session_date = dr.start;
        s.start_date = dr.start;
        s.end_date = dr.end;
      }
    }
    return s;
  }

  // Format D / D'
  const dowM = p0.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (dowM) {
    s.day_of_week = parseDayOfWeek(dowM[1]);
    const dr = parseDateRange(p0, year);
    if (dr) {
      s.session_date = dr.start;
      s.start_date = dr.start;
      s.end_date = dr.end;
    }
    const tm1 = parseTime(p1);
    if (tm1) {
      s.start_time = tm1.start;
      s.end_time = tm1.end;
      s.location = mapLocation(p2);
    } else {
      s.location = mapLocation(p1);
      const tm2 = parseTime(p2);
      if (tm2) {
        s.start_time = tm2.start;
        s.end_time = tm2.end;
      }
    }
    const skillM = p1.match(/\(([^)]+)\)/) ?? p2.match(/\(([^)]+)\)/);
    if (skillM) s.program_name = `${product.title} (${skillM[1]!.trim()})`;
    return s;
  }

  // Format B / C
  if (/^[A-Za-z]+\.?\s*\d/.test(p0)) {
    const dr = parseDateRange(p0, year);
    if (dr) {
      s.session_date = dr.start;
      s.start_date = dr.start;
      s.end_date = dr.end;
    }
    const dow0 = p0.match(/\(([^)]+)\)/);
    const dow1 = p1.match(/\(([^)]+)\)/);
    if (dow1) {
      s.day_of_week = parseDayOfWeek(dow1[1]);
    } else if (dow0) {
      const dt = dow0[1]!.split(/[-–\s,]+/)[0];
      s.day_of_week = parseDayOfWeek(dt);
    }
    s.location = mapLocation(p1);
    const tm = parseTime(p2);
    if (tm) {
      s.start_time = tm.start;
      s.end_time = tm.end;
    }
    return s;
  }
  return s;
}

async function main() {
  const r = await fetch(COLLECTION_URL);
  if (!r.ok) throw new Error(`Collection fetch failed: ${r.status}`);
  const collection = (await r.json()) as { products: Product[] };
  const products = collection.products;
  console.log(`Fetched ${products.length} products from Shopify`);

  const sessions: Session[] = [];
  let skippedNoLoc = 0;
  for (const p of products) {
    for (const v of p.variants ?? []) {
      const s = parseVariant(p, v);
      if (!s.location || !s.start_date) {
        // Skipped — most often the elite-development "KRC" entries that
        // don't map to a known arena. Surface in the summary log so we can
        // onboard new arenas later.
        skippedNoLoc += 1;
        console.warn(`  skip: ${p.handle} :: ${v.title}`);
        continue;
      }
      sessions.push(s);
    }
  }

  // Dedup: same (program_name, start_date, start_time) collisions at
  // different locations need disambiguation via location suffix.
  const key = (s: Session) => `${s.program_name}|${s.start_date ?? ""}|${s.start_time ?? ""}`;
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1);
  for (const s of sessions) {
    if ((counts.get(key(s)) ?? 0) > 1 && s.location) {
      s.program_name = `${s.program_name} (${s.location})`;
    }
  }

  const allDates = sessions.map((s) => s.start_date).filter((x): x is string => !!x).sort();
  const summary = {
    total: sessions.length,
    by_status: {
      available: sessions.filter((s) => s.status === "available").length,
      sold_out: sessions.filter((s) => s.status === "sold_out").length,
    },
  };

  const payload = {
    provider: "perfect-skating-ottawa",
    scanned_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    scan_date_start: allDates[0] ?? null,
    scan_date_end: allDates[allDates.length - 1] ?? null,
    sessions,
    summary,
  };

  console.log(
    `Parsed: total=${sessions.length} available=${summary.by_status.available} sold_out=${summary.by_status.sold_out} skipped_no_loc_or_date=${skippedNoLoc}`,
  );

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
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error(`SCAN_FAILED non_json_response=${responseText.slice(0, 200)}`);
    process.exit(1);
  }
  const d = data.data ?? {};
  console.log(
    `SCAN_COMPLETE provider=perfect-skating-ottawa upserted=${d.sessions_upserted ?? "?"} added=${(d.sessions_added ?? []).length} status_changed=${(d.sessions_status_changed ?? []).length} archived=${(d.sessions_archived ?? []).length} dropped_past=${d.sessions_dropped_past ?? 0}`,
  );
}

main().catch((err) => {
  console.error(`SCAN_FAILED ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
