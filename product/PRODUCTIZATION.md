# HubSpot Record Enrichment - Productized Workflow

This system automates HubSpot record enrichment using ChatGPT/Atlas AI. It researches entities, generates update scripts, and runs them to enrich your HubSpot database.

## Quick Start

### 1. Initial Setup (One-time)

```bash
# Fetch your HubSpot API property definitions
cd product
node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json
```

This creates a file with all available fields in your HubSpot portal. **Do this once, or whenever you add new custom fields.**

### 2. Enrich a Record

**Step 1: Prepare the prompt for Atlas**

```bash
cd product
node prepare-atlas-prompt.js "https://app.hubspot.com/contacts/45592037/contact/123"
```

This generates a complete prompt file (e.g., `atlas-prompt-1234567890.txt`) with:
- The mega-prompt template
- Your HubSpot URL
- All API property definitions

**Step 2: Use with ChatGPT/Atlas**

1. Open ChatGPT/Atlas
2. Copy the contents of the generated `atlas-prompt-*.txt` file
3. Paste it into ChatGPT/Atlas
4. Wait for it to research and generate the `add-to-hubspot.js` code

**Step 3: Run the generated script**

```bash
# Copy the generated code from ChatGPT/Atlas
# Paste it into add-to-hubspot.js (or save as new file)
node add-to-hubspot.js
```

**Optional UI runner**

Prefer a quick page instead of the CLI?
```bash
npm run hubspot:runner
# open http://localhost:5050
```
Paste the Atlas-generated JS, optionally supply a HubSpot token (it will replace `const HUBSPOT_TOKEN = ...`), and click **Run**. The UI captures console output and enforces a timeout so you can see what updated.

## Meta enrichment & de-duplication (new)
- Atlas-generated scripts now search companies by **name and domain** before creating to avoid duplicates.
- Companies (existing or new) are enriched with all research data: domain, website, city/state, description, about_us, industry, etc.
- Team members and discovered contacts get full enrichment: email/phone, city/state, social links, investor fields, notes, best_topic_to_connect_on, etc.
- Recursive creation: if new companies/contacts are found during research, they’re created and fully populated (not just minimally linked).
- Tip: include domains in research output and keep `hubspot-api-defs.json` current so property filtering keeps new fields.
- **Bi-directional branching:** works whether you start with a contact or a company. Contact → company → contacts; and company → contacts (and their companies if different).

## What the System Does

### For Contacts:
- ✅ Fills all available fields (email, phone, city, website, social profiles, etc.)
- ✅ Creates/links to company if mentioned
- ✅ Extracts and adds team members mentioned in research
- ✅ Creates analyst research note with GTM strategy
- ✅ Scores investment confidence (0-100)

### For Companies:
- ✅ Fills all company details
- ✅ Creates/updates all team members
- ✅ Links contacts to company
- ✅ Creates analyst research note
- ✅ Scores investment confidence

## File Structure

```
hubspot-record-adder/
├── mega-prompt.md              # The master prompt template
├── hubspot-api-defs.json       # Your portal's field definitions (generated)
├── add-to-hubspot.js           # Generated script (overwritten each time)
└── product/
    ├── fetch-hubspot-api-defs.js   # Fetches API definitions (run once)
    ├── prepare-atlas-prompt.js     # Prepares complete prompt for Atlas
    ├── PRODUCTIZATION.md            # This file
    └── QUICK-START.md               # Quick reference guide
```

## Workflow Diagram

```
1. You have a HubSpot URL
   ↓
2. Run: prepare-atlas-prompt.js <url>
   ↓
3. Copy generated prompt → Paste into ChatGPT/Atlas
   ↓
4. ChatGPT researches & generates add-to-hubspot.js
   ↓
5. Run: node add-to-hubspot.js
   ↓
6. ✅ Record enriched in HubSpot!
```

## Advanced Usage

### Update API Definitions

If you add new custom fields to HubSpot, refresh the definitions:

```bash
cd product
node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json
```

### Custom Output Location

```bash
cd product
node prepare-atlas-prompt.js "<url>" | pbcopy  # Mac: copy to clipboard
node prepare-atlas-prompt.js "<url>" > ../my-prompt.txt  # Save to file
```

### Batch Processing

Create a script to process multiple URLs:

```bash
#!/bin/bash
cd product
for url in $(cat ../urls.txt); do
  node prepare-atlas-prompt.js "$url" > "../prompt-$(date +%s).txt"
done
```

## Troubleshooting

### "hubspot-api-defs.json not found"
Run: `cd product && node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json`

### "Property not found" errors
The script uses `safePick` to filter properties - it will only use fields that exist in your portal. If you see errors, check that the field name matches exactly.

### Enum value errors
Make sure ChatGPT uses exact uppercase enum values. The template includes examples.

## Tips

1. **Always include API definitions** - This ensures ChatGPT uses correct field names
2. **Review generated code** - Check the `add-to-hubspot.js` before running
3. **Update definitions regularly** - When you add custom fields, refresh the API definitions
4. **Use section 4.5** - This auto-discovers and links related entities

## Next Steps

Consider creating:
- A Chrome extension to grab HubSpot URLs automatically
- A webhook to trigger enrichment from HubSpot
- A dashboard to track enrichment progress
- Integration with your CRM workflow
