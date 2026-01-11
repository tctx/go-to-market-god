// --- JAVASCRIPT TEMPLATE FOR CHATGPT TO FILL ---
// Instructions for ChatGPT:
// Generate code based on the research. 
// 1. Identify the HubSpot Object ID from the URL I provided (e.g. /contacts/123 -> ID is 123).
// 2. Map the research to the properties defined in the provided JSON.
// 3. Output ONLY the Javascript code block below, filled with the real data.

// *** START CODE BLOCK ***
(async () => {
    const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || 'YOUR_HUBSPOT_TOKEN'; // Set via environment variable
    
    // 1. SET THE ID AND TYPE
    const objectId = "REPLACE_WITH_ID_FROM_URL"; 
    const objectType = "contacts"; // or "companies"
  
    // 2. DATA TO UPDATE
    const properties = {
      // Fill these based on the API JSON provided in context
      "jobtitle": "Calculated Job Title",
      "investor_type": "VC", // Example
      "helps_with": "Strategy;Recruiting", // Semicolon separated for multi-select
      "why_targeted": "Specific reason based on research...",
      "notes": "Research summary..." 
      // Add other fields from the API list
    };
  
    // 3. EXECUTE UPDATE
    console.log(`Updating ${objectType} ${objectId}...`);
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${objectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`
      },
      body: JSON.stringify({ properties })
    });
    
    const data = await response.json();
    console.log("Update Success:", data);
  
    // 4. ADD ANALYST NOTE (Research logic)
    const noteBody = `
      <strong>Analyst Research:</strong><br>
      REPLACE_WITH_DEEP_DIVE_ANALYSIS_AND_GTM_STRATEGY
    `;
    
    const noteResponse = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`
      },
      body: JSON.stringify({
        properties: {
          hs_timestamp: Date.now(),
          hs_note_body: noteBody
        },
        associations: [
          {
            to: { id: objectId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: objectType === 'companies' ? 190 : 202 }] 
            // 190 is Company-to-Note, 202 is Contact-to-Note
          }
        ]
      })
    });
    console.log("Note Added");
  })();
  // *** END CODE BLOCK ***