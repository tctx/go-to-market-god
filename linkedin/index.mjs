/**
 * LinkedIn Automation Module
 *
 * Go-to-Market automation for LinkedIn:
 * - Search for contacts at companies
 * - Extract profile information
 * - Send connection requests
 * - Send personalized messages
 * - Sync with HubSpot CRM
 */

// Session management
export { default as LinkedInSession, getSession, closeSession } from "./session.mjs";

// Profile schemas
export * from "./schemas/profile.mjs";

// Actions
export { searchPeople, findPeopleAtCompany, advancedSearch } from "./actions/search.mjs";
export { navigateToProfile, extractProfile, getConnectionStatus } from "./actions/profile.mjs";
export { sendConnectionRequest, withdrawConnection, batchConnect } from "./actions/connect.mjs";
export { sendMessage, generatePersonalizedMessage, previewMessage, sendFollowUp, batchMessage } from "./actions/message.mjs";

// HubSpot integration
export {
  saveProfileToHubSpot,
  findExistingContact,
  associateContactWithCompany,
  findCompany,
  batchSaveToHubSpot,
  getHubSpotContext,
} from "./hubspot/sync.mjs";

/**
 * High-level workflow: Find and engage contacts at a company
 *
 * @param {Object} options
 * @param {string} options.companyName - Target company name
 * @param {string[]} options.roles - Target roles (e.g., ["CEO", "CTO"])
 * @param {number} options.limit - Max contacts to find
 * @param {boolean} options.connect - Whether to send connection requests
 * @param {string} options.connectionNote - Note for connection request
 * @param {boolean} options.saveToHubSpot - Whether to save to HubSpot
 * @param {string} options.hubspotToken - HubSpot API token
 * @param {string} options.hubspotCompanyId - HubSpot company ID to associate
 * @returns {Promise<Object>} Workflow results
 */
export async function engageCompanyContacts(options = {}) {
  const {
    companyName,
    roles = [],
    limit = 10,
    connect = false,
    connectionNote,
    useAI = false,
    saveToHubSpot = false,
    hubspotToken,
    hubspotCompanyId,
  } = options;

  const { getSession } = await import("./session.mjs");
  const { findPeopleAtCompany } = await import("./actions/search.mjs");
  const { extractProfile } = await import("./actions/profile.mjs");
  const { sendConnectionRequest } = await import("./actions/connect.mjs");
  const { saveProfileToHubSpot } = await import("./hubspot/sync.mjs");

  console.log(`[LinkedIn] Starting engagement workflow for ${companyName}...`);

  const session = await getSession();
  const results = {
    company: companyName,
    contactsFound: 0,
    profilesExtracted: [],
    connectionsSent: 0,
    savedToHubSpot: 0,
    errors: [],
  };

  try {
    // Step 1: Find contacts at company
    console.log(`[LinkedIn] Finding contacts at ${companyName}...`);
    const searchResult = await findPeopleAtCompany(session, {
      companyName,
      roles,
      limit,
    });

    if (!searchResult.ok) {
      throw new Error(searchResult.error);
    }

    results.contactsFound = searchResult.employees.length;
    console.log(`[LinkedIn] Found ${results.contactsFound} contacts`);

    // Step 2: Extract detailed profiles
    for (const employee of searchResult.employees) {
      try {
        console.log(`[LinkedIn] Extracting profile: ${employee.name}...`);
        const profile = await extractProfile(session, employee.profileUrl);

        if (profile.ok) {
          results.profilesExtracted.push(profile.profile);

          // Step 3: Save to HubSpot if requested
          if (saveToHubSpot && hubspotToken) {
            try {
              await saveProfileToHubSpot(hubspotToken, profile.profile, {
                companyId: hubspotCompanyId,
              });
              results.savedToHubSpot++;
            } catch (e) {
              results.errors.push(`HubSpot save failed for ${employee.name}: ${e.message}`);
            }
          }

          // Step 4: Send connection request if requested
          if (connect) {
            try {
              const connectResult = await sendConnectionRequest(session, {
                profileUrl: profile.profile.profileUrl,
                note: connectionNote,
                useAI,
                profile: profile.profile,
              });

              if (connectResult.status === 'sent') {
                results.connectionsSent++;
              }
            } catch (e) {
              results.errors.push(`Connection failed for ${employee.name}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        results.errors.push(`Profile extraction failed for ${employee.name}: ${e.message}`);
      }
    }

    console.log(`[LinkedIn] Workflow complete for ${companyName}`);
    console.log(`  - Contacts found: ${results.contactsFound}`);
    console.log(`  - Profiles extracted: ${results.profilesExtracted.length}`);
    console.log(`  - Connections sent: ${results.connectionsSent}`);
    console.log(`  - Saved to HubSpot: ${results.savedToHubSpot}`);

    if (results.errors.length > 0) {
      console.log(`  - Errors: ${results.errors.length}`);
    }

    return {
      ok: true,
      ...results,
    };

  } catch (error) {
    return {
      ok: false,
      error: error.message,
      ...results,
    };
  }
}

export default {
  // Session
  getSession,
  closeSession,

  // Search
  searchPeople: async (...args) => (await import("./actions/search.mjs")).searchPeople(...args),
  findPeopleAtCompany: async (...args) => (await import("./actions/search.mjs")).findPeopleAtCompany(...args),

  // Profile
  navigateToProfile: async (...args) => (await import("./actions/profile.mjs")).navigateToProfile(...args),
  extractProfile: async (...args) => (await import("./actions/profile.mjs")).extractProfile(...args),

  // Connect
  sendConnectionRequest: async (...args) => (await import("./actions/connect.mjs")).sendConnectionRequest(...args),
  batchConnect: async (...args) => (await import("./actions/connect.mjs")).batchConnect(...args),

  // Message
  sendMessage: async (...args) => (await import("./actions/message.mjs")).sendMessage(...args),
  previewMessage: async (...args) => (await import("./actions/message.mjs")).previewMessage(...args),
  batchMessage: async (...args) => (await import("./actions/message.mjs")).batchMessage(...args),

  // HubSpot
  saveProfileToHubSpot: async (...args) => (await import("./hubspot/sync.mjs")).saveProfileToHubSpot(...args),
  batchSaveToHubSpot: async (...args) => (await import("./hubspot/sync.mjs")).batchSaveToHubSpot(...args),
  getHubSpotContext: async (...args) => (await import("./hubspot/sync.mjs")).getHubSpotContext(...args),

  // High-level workflows
  engageCompanyContacts,
};
