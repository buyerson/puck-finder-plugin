# Data Persistence

After scanning, save results locally and submit to the Puck Finder API.

## Local JSON Schema

Save the scan JSON to the working directory (e.g., `/sessions/laughing-eager-faraday/scan-{YYYY-MM-DD-HHmmss}.json`).

```json
{
  "scan_id": "uuid",
  "provider": "nepean-hockey-school",
  "scanned_at": "2026-01-25T10:30:00Z",
  "source_url": "https://nepeanhockeyschool.com/available-sessions/",
  "sessions": [
    {
      "session_date": "2026-01-28",
      "program_name": "Power Edge + Speed",
      "session_type": "drop_in",
      "day_of_week": "Tuesday",
      "start_time": "16:15",
      "location": "Walter Baker",
      "price": null,
      "status": "available",
      "notes": null
    },
    {
      "session_date": "2026-02-16",
      "program_name": "Power Edge - Family Day",
      "session_type": "clinic",
      "day_of_week": "Monday",
      "start_time": null,
      "location": "Cardel Rec",
      "price": 90.00,
      "status": "limited",
      "notes": "Low Ratio 4:1"
    }
  ],
  "summary": {
    "total": 25,
    "by_status": {
      "available": 20,
      "limited": 2,
      "sold_out": 3
    }
  }
}
```

### Field notes

- `session_date` is critical -- the API uses it to set `start_date`, and the app filters by `start_date >= first_of_month`. Sessions with null `session_date` won't appear.
- `session_type` must be one of: `camp`, `drop_in`, `series`, `clinic`, `ice_rental`, `unknown`
- `status` must be one of: `available`, `limited`, `sold_out`, `special_event`
- Generate a UUID for `scan_id` (use `uuidgen` in bash or `import uuid; str(uuid.uuid4())` in Python)
- `scanned_at` should be the current UTC timestamp in ISO 8601 format

## API Submission

Submit the scan JSON to the Puck Finder API using curl:

```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @scan-{YYYY-MM-DD-HHmmss}.json
```

Replace the filename placeholder with the actual scan file path.

### What the API handles

- Looks up the provider by the `provider` slug in the JSON (returns 404 if not found)
- Upserts sessions: sets `is_active` based on status (available/limited = true, otherwise false)
- Derives `day_of_week` and `start_date`/`end_date` from `session_date` if not provided
- Updates `last_scanned_at` on the provider record
- Inserts a scan record for audit trail
