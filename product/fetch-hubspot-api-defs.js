#!/usr/bin/env node
/**
 * Fetches HubSpot API property definitions for contacts and companies
 * Run this to get the latest field definitions for your portal
 * 
 * Usage: 
 *   node fetch-hubspot-api-defs.js > ../hubspot-api-defs.json
 *   Or: node fetch-hubspot-api-defs.js (outputs to stdout)
 */

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

if (!HUBSPOT_TOKEN) {
  console.error('❌ HUBSPOT_TOKEN environment variable is required');
  console.error('   Set it via: export HUBSPOT_TOKEN=pat-na1-xxxxx');
  process.exit(1);
}

const fetchProperties = async (objectType) => {
  const url = `https://api.hubapi.com/crm/v3/properties/${objectType}?archived=false`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch ${objectType} properties: ${res.status} ${res.statusText}`);
  }
  
  return await res.json();
};

(async () => {
  try {
    console.error('Fetching HubSpot property definitions...');
    
    const [contactsProps, companiesProps] = await Promise.all([
      fetchProperties('contacts'),
      fetchProperties('companies'),
    ]);
    
    const output = {
      contacts: contactsProps.results || [],
      companies: companiesProps.results || [],
      fetchedAt: new Date().toISOString(),
      portalToken: HUBSPOT_TOKEN.substring(0, 10) + '...', // Partial token for reference
    };
    
    console.log(JSON.stringify(output, null, 2));
    console.error(`\n✅ Fetched ${output.contacts.length} contact properties and ${output.companies.length} company properties`);
    console.error('💡 Save this output to ../hubspot-api-defs.json (parent directory)');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();

