---
name: onboard-provider
description: Create a new hockey program provider in the PuckFinder API. Use when a scan fails because the provider doesn't exist yet, or when onboarding a new provider.
---

# Onboard New Provider

Register a new hockey program provider in the PuckFinder backend so scans can be submitted for it.

## When to Use

- A scan skill reports "Provider not found" or "provider will need to be added"
- The user asks to add/onboard/register a new provider
- A new provider needs to be created before submitting scan data

## Workflow

1. **Gather provider details** from the user or infer from context:
   - **name** (required): Display name (e.g., "Summit Goaltending")
   - **slug** (required): Kebab-case identifier (e.g., "summit-goaltending"). Must match the `provider` field used in scan JSON files.
   - **website_url** (optional): Provider's website URL
   - **logo_url** (optional): URL to provider's logo image

2. **Check if provider already exists:**

```bash
curl -s "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/providers" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" | jq '.data[] | .slug'
```

3. **Create the provider:**

```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/providers" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Provider Display Name",
    "slug": "provider-slug",
    "website_url": "https://example.com"
  }'
```

4. **Verify creation** by checking the response. A successful response looks like:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Provider Display Name",
    "slug": "provider-slug",
    "website_url": "https://example.com",
    "is_active": true,
    "last_scanned_at": null
  }
}
```

5. **If a pending scan JSON exists**, re-submit it now:

```bash
curl -X POST "https://erjeeuhlgfclrcpirprj.supabase.co/functions/v1/puck-finder-api/scans" \
  -H "x-api-key: pf-write-k8x7m2nQ9vR4" \
  -H "Content-Type: application/json" \
  -d @data/provider-scans/{provider-slug}/scan-{latest}.json
```

## Existing Providers

For reference, these providers are already registered:

| Slug | Name |
|------|------|
| amped-sports | Amped Sports |
| apex-hockey | Apex Hockey Ottawa |
| ashley-holmes | Ashley Holmes Training |
| nepean-hockey-school | Nepean Hockey School |
| next-generation-hockey | Next Generation Hockey |
| ottawa-ice-time | City of Ottawa |
| perfect-skating-ottawa | Perfect Skating Ottawa |
| sensplex | Sensplex |

## Slug Convention

- Use kebab-case (lowercase, hyphens)
- Match the slug used in scan JSON files (`"provider": "the-slug"`)
- Match the skill directory name (e.g., `skills/summit-goaltending/` → slug `summit-goaltending`)

## API Details

- **Endpoint:** `POST /providers`
- **Auth:** `x-api-key: pf-write-k8x7m2nQ9vR4`
- **Required fields:** `name`, `slug`
- **Optional fields:** `website_url`, `logo_url`
- **Unique constraint:** `slug` must be unique (returns error if duplicate)

## After Onboarding

Once the provider is created:
1. Inform the user the provider is ready
2. If there's a pending scan file, submit it automatically
3. Suggest running the provider's scan skill to populate sessions
