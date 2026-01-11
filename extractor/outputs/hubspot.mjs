/**
 * HubSpot Output Writer
 * Writes extracted data to HubSpot company/contact records
 */

const HUBSPOT_BASE_URL = process.env.HUBSPOT_BASE_URL || "https://api.hubapi.com";

/**
 * Make a request to the HubSpot API
 * @param {string} token - HubSpot API token
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {Object} body - Request body
 * @returns {Promise<Object>}
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
 * Format extracted data for HubSpot properties
 * Flattens nested objects and converts arrays to JSON strings
 * @param {Object} data - Extracted data
 * @param {string} prefix - Property name prefix (e.g., "sf_extracted_")
 * @returns {Object} Flattened properties
 */
export function formatForHubspot(data, prefix = "sf_extracted_") {
  const properties = {};

  function flatten(obj, currentPrefix = "") {
    for (const [key, value] of Object.entries(obj)) {
      const propName = currentPrefix ? `${currentPrefix}_${key}` : `${prefix}${key}`;

      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        // Store arrays as JSON strings
        properties[propName] = JSON.stringify(value);
      } else if (typeof value === "object") {
        // Recurse into objects, but also store the full object as JSON
        properties[propName] = JSON.stringify(value);
        // Optionally flatten nested properties (commented out to avoid property explosion)
        // flatten(value, propName);
      } else {
        properties[propName] = String(value);
      }
    }
  }

  flatten(data);
  return properties;
}

/**
 * Write extracted menu data to a HubSpot company record
 * @param {string} token - HubSpot API token
 * @param {string} companyId - HubSpot company ID
 * @param {Object} menuData - Extracted menu data
 * @returns {Promise<Object>}
 */
export async function writeMenuToCompany(token, companyId, menuData) {
  const properties = {
    // Store the full menu as JSON in research notes
    sf_research_notes: JSON.stringify(menuData, null, 2),
    // Track when we last extracted
    sf_last_enriched_at: new Date().toISOString(),
    sf_enrichment_status: "success",
    sf_enrichment_notes: `Menu extracted with ${menuData.menuSections?.length || 0} sections`,
  };

  return hubspotRequest(token, "PATCH", `/crm/v3/objects/companies/${companyId}`, {
    properties,
  });
}

/**
 * Write extracted business info to a HubSpot company record
 * @param {string} token - HubSpot API token
 * @param {string} companyId - HubSpot company ID
 * @param {Object} businessInfo - Extracted business info
 * @returns {Promise<Object>}
 */
export async function writeBusinessInfoToCompany(token, companyId, businessInfo) {
  const properties = {
    sf_research_notes: JSON.stringify(businessInfo, null, 2),
    sf_last_enriched_at: new Date().toISOString(),
    sf_enrichment_status: "success",
  };

  // Map specific fields to HubSpot properties if they exist
  if (businessInfo.ownerName) {
    properties.sf_best_contact_name = businessInfo.ownerName;
  }
  if (businessInfo.ownerTitle) {
    properties.sf_best_contact_role = businessInfo.ownerTitle;
  }
  if (businessInfo.email) {
    properties.sf_best_contact_email = businessInfo.email;
  }
  if (businessInfo.phone) {
    properties.phone = businessInfo.phone;
  }
  if (businessInfo.description) {
    properties.description = businessInfo.description;
  }
  if (businessInfo.city) {
    properties.city = businessInfo.city;
  }
  if (businessInfo.state) {
    properties.state = businessInfo.state;
  }

  return hubspotRequest(token, "PATCH", `/crm/v3/objects/companies/${companyId}`, {
    properties,
  });
}

/**
 * Write any extracted data to a HubSpot company record
 * @param {string} token - HubSpot API token
 * @param {string} companyId - HubSpot company ID
 * @param {Object} data - Extracted data
 * @param {string} extractionType - Type of extraction (menu, business-info, custom)
 * @returns {Promise<Object>}
 */
export async function writeExtractionToCompany(token, companyId, data, extractionType = "custom") {
  const properties = {
    sf_research_notes: JSON.stringify(data, null, 2),
    sf_last_enriched_at: new Date().toISOString(),
    sf_enrichment_status: "success",
    sf_enrichment_notes: `Extracted ${extractionType} data at ${new Date().toISOString()}`,
  };

  return hubspotRequest(token, "PATCH", `/crm/v3/objects/companies/${companyId}`, {
    properties,
  });
}

/**
 * Search for a company by domain/website
 * @param {string} token - HubSpot API token
 * @param {string} domain - Domain to search for
 * @returns {Promise<Object|null>} Company record or null
 */
export async function findCompanyByDomain(token, domain) {
  // Clean the domain
  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

  const response = await hubspotRequest(token, "POST", "/crm/v3/objects/companies/search", {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "domain",
            operator: "CONTAINS_TOKEN",
            value: cleanDomain,
          },
        ],
      },
    ],
    properties: ["name", "domain", "website", "sf_research_notes"],
    limit: 1,
  });

  return response?.results?.[0] || null;
}

/**
 * Get all companies with a website that need extraction
 * @param {string} token - HubSpot API token
 * @param {number} limit - Max companies to return
 * @returns {Promise<Array>} List of companies
 */
export async function getCompaniesNeedingExtraction(token, limit = 100) {
  const response = await hubspotRequest(token, "POST", "/crm/v3/objects/companies/search", {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "website",
            operator: "HAS_PROPERTY",
          },
          {
            propertyName: "sf_enrichment_status",
            operator: "NOT_HAS_PROPERTY",
          },
        ],
      },
    ],
    properties: ["name", "domain", "website", "sf_research_notes", "sf_enrichment_status"],
    limit,
  });

  return response?.results || [];
}

export default {
  formatForHubspot,
  writeMenuToCompany,
  writeBusinessInfoToCompany,
  writeExtractionToCompany,
  findCompanyByDomain,
  getCompaniesNeedingExtraction,
};
