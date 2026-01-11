#!/usr/bin/env node
/**
 * Prepares a complete prompt for ChatGPT/Atlas with mega-prompt + API definitions
 * 
 * Usage: 
 *   node prepare-atlas-prompt.js <hubspot-url> [api-defs-file]
 * 
 * Example:
 *   node prepare-atlas-prompt.js "https://app.hubspot.com/contacts/45592037/contact/123" hubspot-api-defs.json
 */

const fs = require('fs');
const path = require('path');

const hubspotUrl = process.argv[2];
const apiDefsFile = process.argv[3] || path.join(__dirname, '..', 'hubspot-api-defs.json');

if (!hubspotUrl) {
  console.error('❌ Error: HubSpot URL required');
  console.error('\nUsage: node prepare-atlas-prompt.js <hubspot-url> [api-defs-file]');
  console.error('\nExample:');
  console.error('  node prepare-atlas-prompt.js "https://app.hubspot.com/contacts/45592037/contact/123"');
  process.exit(1);
}

// Read mega-prompt (in parent directory)
const megaPromptPath = path.join(__dirname, '..', 'mega-prompt.md');
if (!fs.existsSync(megaPromptPath)) {
  console.error('❌ Error: mega-prompt.md not found in parent directory');
  process.exit(1);
}

let megaPrompt = fs.readFileSync(megaPromptPath, 'utf8');

// Replace the URL placeholder
megaPrompt = megaPrompt.replace(
  /Target Profile URL: \[PASTE THE HUBSPOT URL HERE[^\]]*\]/,
  `Target Profile URL: ${hubspotUrl}`
);

// Try to read API definitions
let apiDefs = null;
if (fs.existsSync(apiDefsFile)) {
  try {
    apiDefs = JSON.parse(fs.readFileSync(apiDefsFile, 'utf8'));
    console.error(`✅ Loaded API definitions from ${apiDefsFile}`);
  } catch (e) {
    console.error(`⚠️  Warning: Could not parse ${apiDefsFile}: ${e.message}`);
  }
} else {
  console.error(`⚠️  Warning: ${apiDefsFile} not found. Run 'node fetch-hubspot-api-defs.js > ${apiDefsFile}' first for best results.`);
}

// Build the complete prompt
let completePrompt = megaPrompt;

if (apiDefs) {
  completePrompt += '\n\n---\n\n';
  completePrompt += '## HubSpot API Property Definitions\n\n';
  completePrompt += 'Here are the available properties for your HubSpot portal:\n\n';
  completePrompt += '### Contacts Properties:\n\n';
  completePrompt += '```json\n';
  completePrompt += JSON.stringify(apiDefs.contacts || [], null, 2);
  completePrompt += '\n```\n\n';
  completePrompt += '### Companies Properties:\n\n';
  completePrompt += '```json\n';
  completePrompt += JSON.stringify(apiDefs.companies || [], null, 2);
  completePrompt += '\n```\n';
}

// Output to stdout (can be piped to clipboard or file)
console.log(completePrompt);

// Also save to a file for easy access
const outputFile = `atlas-prompt-${Date.now()}.txt`;
fs.writeFileSync(outputFile, completePrompt);
console.error(`\n✅ Complete prompt saved to: ${outputFile}`);
console.error('💡 Copy this file content and paste into ChatGPT/Atlas');

