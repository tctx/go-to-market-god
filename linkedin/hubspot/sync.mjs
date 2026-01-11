/**
 * LinkedIn to HubSpot Sync
 *
 * Save LinkedIn profiles as HubSpot contacts under companies
 */

const HUBSPOT_BASE_URL = process.env.HUBSPOT_BASE_URL || "https://api.hubapi.com";

/**
 * Make a request to the HubSpot API
 */
async function hubspotRequest(token, method, path, body = null) {
  const url = `${HUBSPOT_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = null;
  }

  if (!response.ok) {
    const error = new Error(`HubSpot API ${response.status}: ${text.slice(0, 400)}`);
    error.status = response.status;
    error.payload = json || text;
    throw error;
  }

  return json;
}

/**
 * Map LinkedIn profile to HubSpot contact properties
 */
function mapProfileToHubSpotProperties(profile) {
  const properties = {};

  // Parse name
  if (profile.name) {
    const nameParts = profile.name.split(' ');
    properties.firstname = nameParts[0];
    properties.lastname = nameParts.slice(1).join(' ') || nameParts[0];
  }

  // Job info
  if (profile.currentTitle || profile.headline) {
    properties.jobtitle = profile.currentTitle || profile.headline?.split(' at ')?.[0] || profile.headline;
  }

  if (profile.currentCompany) {
    properties.company = profile.currentCompany;
  }

  // Location
  if (profile.location) {
    // Try to parse city/state from location string
    const locationParts = profile.location.split(',').map(s => s.trim());
    if (locationParts.length >= 2) {
      properties.city = locationParts[0];
      properties.state = locationParts[1];
    } else {
      properties.city = profile.location;
    }
  }

  // Contact info (if available)
  if (profile.email) {
    properties.email = profile.email;
  }

  if (profile.phone) {
    properties.phone = profile.phone;
  }

  if (profile.website) {
    properties.website = profile.website;
  }

  // LinkedIn-specific custom properties (sf_ prefix for Synthetic Friends)
  properties.sf_linkedin_url = profile.profileUrl;
  properties.sf_linkedin_id = profile.profileId;
  properties.sf_lead_source = 'linkedin';
  properties.sf_enriched_at = new Date().toISOString();

  // Store full profile data in research notes
  if (profile.about || profile.experience || profile.education) {
    const notes = [];

    if (profile.about) {
      notes.push(`## About\n${profile.about}`);
    }

    if (profile.experience?.length) {
      notes.push(`## Experience\n${profile.experience.map(e =>
        `- ${e.title} at ${e.company} (${e.dateRange || e.duration || 'N/A'})`
      ).join('\n')}`);
    }

    if (profile.education?.length) {
      notes.push(`## Education\n${profile.education.map(e =>
        `- ${e.school}${e.degree ? ': ' + e.degree : ''}`
      ).join('\n')}`);
    }

    if (profile.skills?.length) {
      notes.push(`## Skills\n${profile.skills.join(', ')}`);
    }

    properties.sf_research_notes = notes.join('\n\n');
  }

  // Connection status
  if (profile.connectionStatus) {
    properties.sf_linkedin_connection = profile.connectionStatus;
  }

  return properties;
}

/**
 * Search for existing contact by LinkedIn URL or email
 */
export async function findExistingContact(token, profile) {
  // Search by LinkedIn URL first (most reliable)
  if (profile.profileUrl) {
    try {
      const response = await hubspotRequest(token, "POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "sf_linkedin_url",
                operator: "EQ",
                value: profile.profileUrl,
              },
            ],
          },
        ],
        properties: ["firstname", "lastname", "email", "company", "sf_linkedin_url"],
        limit: 1,
      });

      if (response?.results?.length > 0) {
        return response.results[0];
      }
    } catch (e) {
      // Property may not exist, continue to email search
    }
  }

  // Search by email if available
  if (profile.email) {
    try {
      const response = await hubspotRequest(token, "POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: profile.email,
              },
            ],
          },
        ],
        properties: ["firstname", "lastname", "email", "company", "sf_linkedin_url"],
        limit: 1,
      });

      if (response?.results?.length > 0) {
        return response.results[0];
      }
    } catch (e) {
      // Continue
    }
  }

  // Search by name + company as last resort
  if (profile.name && profile.currentCompany) {
    try {
      const nameParts = profile.name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      const response = await hubspotRequest(token, "POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "firstname",
                operator: "EQ",
                value: firstName,
              },
              {
                propertyName: "lastname",
                operator: "CONTAINS_TOKEN",
                value: lastName,
              },
              {
                propertyName: "company",
                operator: "CONTAINS_TOKEN",
                value: profile.currentCompany,
              },
            ],
          },
        ],
        properties: ["firstname", "lastname", "email", "company", "sf_linkedin_url"],
        limit: 1,
      });

      if (response?.results?.length > 0) {
        return response.results[0];
      }
    } catch (e) {
      // No match found
    }
  }

  return null;
}

/**
 * Save a LinkedIn profile to HubSpot as a contact
 *
 * @param {string} token - HubSpot API token
 * @param {Object} profile - LinkedIn profile data
 * @param {Object} options - Save options
 * @param {string} options.companyId - HubSpot company ID to associate with
 * @param {boolean} options.updateIfExists - Update existing contact if found
 * @returns {Promise<Object>} Created/updated contact
 */
export async function saveProfileToHubSpot(token, profile, options = {}) {
  const { companyId, updateIfExists = true } = options;

  // Map profile to HubSpot properties
  const properties = mapProfileToHubSpotProperties(profile);

  console.log(`[HubSpot] Saving contact: ${profile.name}...`);

  // Check for existing contact
  const existing = await findExistingContact(token, profile);

  let contact;
  let isNew = false;

  if (existing) {
    if (updateIfExists) {
      // Update existing contact
      console.log(`[HubSpot] Updating existing contact: ${existing.id}`);
      contact = await hubspotRequest(token, "PATCH", `/crm/v3/objects/contacts/${existing.id}`, {
        properties,
      });
    } else {
      console.log(`[HubSpot] Contact already exists: ${existing.id}`);
      contact = existing;
    }
  } else {
    // Create new contact
    console.log(`[HubSpot] Creating new contact`);
    contact = await hubspotRequest(token, "POST", "/crm/v3/objects/contacts", {
      properties,
    });
    isNew = true;
  }

  // Associate with company if provided
  if (companyId && contact.id) {
    try {
      await associateContactWithCompany(token, contact.id, companyId);
      console.log(`[HubSpot] Associated contact with company: ${companyId}`);
    } catch (e) {
      console.log(`[HubSpot] Could not associate with company: ${e.message}`);
    }
  }

  return {
    ok: true,
    contactId: contact.id,
    isNew,
    properties: contact.properties,
  };
}

/**
 * Associate a contact with a company
 */
export async function associateContactWithCompany(token, contactId, companyId) {
  // HubSpot v4 associations API
  return hubspotRequest(token, "PUT", `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`, [
    {
      associationCategory: "HUBSPOT_DEFINED",
      associationTypeId: 1, // Primary company association
    },
  ]);
}

/**
 * Find a company by name or domain
 */
export async function findCompany(token, options = {}) {
  const { name, domain } = options;

  if (!name && !domain) {
    throw new Error("Either name or domain is required");
  }

  const filters = [];

  if (domain) {
    // Clean domain
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .toLowerCase();

    filters.push({
      propertyName: "domain",
      operator: "CONTAINS_TOKEN",
      value: cleanDomain,
    });
  }

  if (name && !domain) {
    filters.push({
      propertyName: "name",
      operator: "CONTAINS_TOKEN",
      value: name,
    });
  }

  const response = await hubspotRequest(token, "POST", "/crm/v3/objects/companies/search", {
    filterGroups: [{ filters }],
    properties: ["name", "domain", "website", "industry"],
    limit: 1,
  });

  return response?.results?.[0] || null;
}

/**
 * Batch save multiple LinkedIn profiles to HubSpot
 */
export async function batchSaveToHubSpot(token, profiles, options = {}) {
  const { companyId, updateIfExists = true } = options;

  const results = {
    created: 0,
    updated: 0,
    failed: 0,
    contacts: [],
  };

  for (const profile of profiles) {
    try {
      const result = await saveProfileToHubSpot(token, profile, {
        companyId,
        updateIfExists,
      });

      if (result.ok) {
        if (result.isNew) {
          results.created++;
        } else {
          results.updated++;
        }
        results.contacts.push({
          contactId: result.contactId,
          name: profile.name,
          linkedinUrl: profile.profileUrl,
        });
      }
    } catch (error) {
      console.error(`[HubSpot] Failed to save ${profile.name}: ${error.message}`);
      results.failed++;
    }
  }

  console.log(`[HubSpot] Batch complete: ${results.created} created, ${results.updated} updated, ${results.failed} failed`);

  return {
    ok: true,
    ...results,
  };
}

/**
 * Get HubSpot context for a contact (for AI message personalization)
 */
export async function getHubSpotContext(token, contactId) {
  try {
    // Get contact details
    const contact = await hubspotRequest(token, "GET", `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,company,jobtitle,sf_research_notes,hs_lead_status`);

    // Get associated company
    let company = null;
    try {
      const associations = await hubspotRequest(token, "GET", `/crm/v4/objects/contacts/${contactId}/associations/companies`);
      if (associations?.results?.length > 0) {
        const companyId = associations.results[0].toObjectId;
        company = await hubspotRequest(token, "GET", `/crm/v3/objects/companies/${companyId}?properties=name,domain,industry,description,numberofemployees`);
      }
    } catch (e) {
      // No company association
    }

    // Get recent engagement activity
    let interactions = null;
    try {
      const engagements = await hubspotRequest(token, "GET", `/crm/v3/objects/contacts/${contactId}/associations/emails?limit=5`);
      if (engagements?.results?.length > 0) {
        interactions = `${engagements.results.length} recent emails`;
      }
    } catch (e) {
      // No engagements
    }

    return {
      contact: contact?.properties,
      company: company?.properties,
      industry: company?.properties?.industry,
      companyName: company?.properties?.name,
      notes: contact?.properties?.sf_research_notes,
      interactions,
    };
  } catch (error) {
    console.error(`[HubSpot] Could not get context: ${error.message}`);
    return {};
  }
}

export default {
  saveProfileToHubSpot,
  findExistingContact,
  associateContactWithCompany,
  findCompany,
  batchSaveToHubSpot,
  getHubSpotContext,
  mapProfileToHubSpotProperties,
};
