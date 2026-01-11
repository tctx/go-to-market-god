// ... existing HUBSPOT_ACCESS_TOKEN and listeners ...

// ADD THIS TO YOUR LISTENER BLOCK
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ... existing checks ...
    
    if (request.action === 'updateRecord') {
      updateHubSpotRecord(request.objectType, request.objectId, request.properties)
        .then(response => sendResponse({ success: true, data: response }))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;
    }
    
    if (request.action === 'associateRecords') {
      associateHubSpotRecords(request.fromObjectType, request.fromId, request.toObjectType, request.toId)
        .then(response => sendResponse({ success: true, data: response }))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true;
    }
  });
  
  // ... existing create functions ...
  
  // --- NEW FUNCTIONS ---
  
  async function updateHubSpotRecord(objectType, objectId, properties) {
    // objectType should be 'contacts' or 'companies'
    const apiUrl = `https://api.hubapi.com/crm/v3/objects/${objectType}/${objectId}`;
    
    try {
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HUBSPOT_ACCESS_TOKEN}`
        },
        body: JSON.stringify({ properties })
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HubSpot API Update Error: ${JSON.stringify(errorData)}`);
      }
  
      return await response.json();
    } catch (error) {
      console.error(`Error updating ${objectType}:`, error);
      throw error;
    }
  }
  
  async function associateHubSpotRecords(fromType, fromId, toType, toId) {
    // Association Type 1 is usually Company to Contact (and vice versa) in v4
    // We use the batch endpoint or the specific association endpoint.
    // Using the v3 association endpoint:
    const apiUrl = `https://api.hubapi.com/crm/v3/objects/${fromType}/${fromId}/associations/${toType}/${toId}/association_type_id_here`; 
    
    // NOTE: For Company <-> Contact, the association type is often just 'contact_to_company' 
    // But strictly using IDs: Contact to Company is usually type 1.
    
    const associationUrl = `https://api.hubapi.com/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`;
    
    // We will assume primary association label usually.
    try {
      const response = await fetch(associationUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${HUBSPOT_ACCESS_TOKEN}`
        },
        body: JSON.stringify([
          {
            "associationCategory": "HUBSPOT_DEFINED",
            "associationTypeId": 1 // 1 is Contact-to-Company
          }
        ])
      });
  
      if (!response.ok) {
        throw new Error(`HubSpot Association Error`);
      }
      return { success: true };
    } catch (error) {
      console.error('Error associating records:', error);
      throw error;
    }
  }