# Meta Enrichment & De-duplication Notes

This summarizes the latest prompt changes so the team remembers what to expect when Atlas generates code.

## What changed
- Robust company search: find by name **and** domain to prevent duplicates before creating.
- Full company enrichment: whether found or newly created, companies get all research data (domain, website, city, state, description, about_us, industry, etc.).
- Full contact enrichment: team members get every research field (email, phone, city/state, social links, investor fields, notes, best_topic_to_connect_on, etc.).
- Recursive enrichment: discovered companies/contacts are created/updated with full data, even when found via other entities.
- **Bi-directional branching:** works whether you start from a contact or a company. Contact → company → contacts, and company → contacts (and their companies when different).

## How to get the best results
- Include domains in research output so company de-duplication works.
- Provide `company_`-prefixed fields for contacts (domain, website, city, state, description) so companies can be created/updated with full data.
- Keep `hubspot-api-defs.json` refreshed when you add custom fields so property filtering doesn’t drop new values.
- Let the script-runner show console output to confirm when existing companies were updated vs. created.

## Bi-directional flows (what the prompt now does)
- Contact → Company → Contacts:
  - Enrich the starting contact fully.
  - Discover company (search by name + domain), enrich or create with full data, link.
  - Extract team members from the research note, enrich/create them with full data, and link them to the company.
- Company → Contacts:
  - Enrich the starting company fully.
  - Extract team members from the research note, enrich/create them with full data, and link them to the company (objectId).
  - If a team member belongs to a different company, create/enrich that company too (name + domain search) and link.
