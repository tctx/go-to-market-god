# HubSpot Enrichment - Quick Start

## 🚀 3-Step Workflow

### Step 1: Fetch API Definitions (One-time setup)
```bash
cd product
node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json
```

### Step 2: Prepare Prompt for Atlas
```bash
cd product
node prepare-atlas-prompt.js "YOUR_HUBSPOT_URL"
```

This creates a file like `atlas-prompt-1234567890.txt` in the product directory.

### Step 3: Use with ChatGPT/Atlas
1. Open the generated `atlas-prompt-*.txt` file
2. Copy all contents
3. Paste into ChatGPT/Atlas
4. Wait for it to generate `add-to-hubspot.js` code
5. Copy the code → paste into `add-to-hubspot.js` (in root directory)
6. Run: `node add-to-hubspot.js` (from root directory)

### Optional: run via the local web UI
```bash
npm run hubspot:runner
# open http://localhost:5050
```
Paste the Atlas-generated JS, optionally drop in a token (it will replace `const HUBSPOT_TOKEN = ...`), and click **Run**. The server executes locally and streams console output back to the page.

## Meta enrichment & de-duplication (new)
- Scripts now de-dupe companies by **name and domain** before creating.
- Companies are fully enriched (domain, website, city/state, description, about_us, industry, etc.) whether they already exist or are newly created.
- Team members and discovered contacts get full enrichment (email/phone, city/state, social links, investor fields, notes, best_topic_to_connect_on, etc.).
- Recursive creation: any newly discovered companies/contacts are created and fully populated.
- Tip: surface domains in research output and keep `hubspot-api-defs.json` fresh so property filtering keeps new fields.
- **Bi-directional branching:** works both ways. If you start with a contact it enriches contact → company → contacts; if you start with a company it enriches company → contacts (and creates/enriches their companies when different).

## 📋 Example

```bash
# 1. Setup (once)
cd product
node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json

# 2. Prepare prompt
node prepare-atlas-prompt.js "https://app.hubspot.com/contacts/45592037/contact/174144736362"

# 3. Copy atlas-prompt-*.txt → Paste into ChatGPT/Atlas
# 4. Copy generated code → Run it (from root directory)
cd ..
node add-to-hubspot.js
```

## ✨ What It Does

- ✅ Researches the entity online
- ✅ Fills ALL available fields (email, phone, city, website, etc.)
- ✅ Creates company if it doesn't exist
- ✅ Extracts and adds team members from research
- ✅ Creates analyst research note with GTM strategy
- ✅ Links everything together automatically

## 🔄 Refresh API Definitions

When you add new custom fields to HubSpot:
```bash
cd product
node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json
```

## 📚 Full Documentation

See `PRODUCTIZATION.md` for complete details.
