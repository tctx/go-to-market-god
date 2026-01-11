# HubSpot Atlas Enricher (Chrome Extension)

A lightweight MV3 extension that injects an "Atlas Enrich" button on HubSpot records. It sends page context + your mega prompt to GPT, then executes the returned script through the local runner and refreshes the page.

## What it does
1) Injects a button on `app.hubspot.com` pages.  
2) Collects URL, title, selection, and a body text snippet.  
3) Loads `mega-prompt.md` (bundled in the extension).  
4) Calls OpenAI (or your compatible endpoint) with the mega prompt + context.  
5) Sends the returned JS to the local runner (`product/script-runner.js`) with the HubSpot token.  
6) Refreshes the page after execution.

## Setup
1) Run the local runner: `npm run hubspot:runner` (listens on `http://localhost:5050`).  
   - It serves `/run` for script execution and `/prompt` to supply `mega-prompt.md` (keeps the prompt out of the packaged extension).  
   - If `/prompt` is unreachable, the extension falls back to a bundled `mega-prompt.md` — you can still copy/symlink it here if you prefer.
2) Build/Load unpacked:
   - Visit `chrome://extensions`, enable Developer Mode.
   - Click "Load unpacked" and select `product/extension`.
3) Open the options page (Extension card → Details → Extension options) and set:
   - OpenAI API key
   - HubSpot private app token
   - Runner URL (default `http://localhost:5050/run`)
   - Model (default `gpt-4o-mini`)
   - OpenAI base URL if you proxy.

## Usage
1) Navigate to a HubSpot record page.  
2) Click **Atlas Enrich** (bottom-right).  
3) The extension will:
   - Load the mega prompt.
   - Call OpenAI with page context.
   - Send the generated script to the local runner (with your token).
   - Refresh the page when done.

## Notes
- CORS: the local runner now returns permissive CORS headers, so the extension can POST to it.  
- Security: keys/tokens live in `chrome.storage.sync`. Keep the extension unpacked/local for safety.  
- If OpenAI or the runner fails, status text appears above the button.  
- You can change the runner URL to point at any service that accepts `{ code, token }` like the existing `script-runner.js`.
