# HubSpot Enrichment - Quick Start

## 🚀 3-Step Workflow

### Step 1: Fetch API Definitions (One-time setup)
```bash
npm run hubspot:fetch-api
```
Or:
```bash
node fetch-hubspot-api-defs.js > hubspot-api-defs.json
```

### Step 2: Prepare Prompt for Atlas
```bash
npm run hubspot:prepare "https://app.hubspot.com/contacts/45592037/contact/123"
```
Or:
```bash
node prepare-atlas-prompt.js "YOUR_HUBSPOT_URL"
```

This creates a file like `atlas-prompt-1234567890.txt`

### Step 3: Use with ChatGPT/Atlas
1. Open the generated `atlas-prompt-*.txt` file
2. Copy all contents
3. Paste into ChatGPT/Atlas
4. Wait for it to generate `add-to-hubspot.js` code
5. Copy the code → paste into `add-to-hubspot.js`
6. Run: `node add-to-hubspot.js`

### Optional: GTM Console UI
Run a local UI to set your token, initialize properties, and run scripts:
```bash
npm run gtm:gui
```
Open the URL printed in the terminal, then:
1. Save your HubSpot token
2. Initialize properties
3. Paste or load `add-to-hubspot.js` and run it

### OAuth setup (HubSpot login button)
If you want the official HubSpot login flow inside the UI:
1. Create a HubSpot public app and add a redirect URL like `http://localhost:40123/oauth/callback`
2. Set these in `.env`:
```
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_REDIRECT_URI=http://localhost:40123/oauth/callback
```
3. Run the GUI with the same port:
```bash
PORT=40123 npm run gtm:gui
```

## 📋 Example

```bash
# 1. Setup (once)
npm run hubspot:fetch-api

# 2. Prepare prompt
npm run hubspot:prepare "https://app.hubspot.com/contacts/45592037/contact/174144736362"

# 3. Copy atlas-prompt-*.txt → Paste into ChatGPT/Atlas
# 4. Copy generated code → Run it
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
npm run hubspot:fetch-api
```

## 📚 Full Documentation

See `PRODUCTIZATION.md` for complete details.
