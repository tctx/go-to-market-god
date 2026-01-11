/**
 * LinkedIn Profile Actions
 *
 * Navigate to profiles and extract detailed information
 */

import { z } from "zod";
import { FullProfileSchema, ConnectionStatusSchema } from "../schemas/profile.mjs";
import { searchPeople } from "./search.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse profile URL or ID to get the canonical profile URL
 */
function parseProfileInput(input) {
  if (!input) return null;

  // Already a full URL
  if (input.includes('linkedin.com/in/')) {
    const match = input.match(/linkedin\.com\/in\/([^\/\?]+)/);
    if (match) {
      return {
        profileId: match[1],
        profileUrl: `https://www.linkedin.com/in/${match[1]}/`,
      };
    }
  }

  // Just a profile ID
  if (!input.includes(' ') && !input.includes('/')) {
    return {
      profileId: input,
      profileUrl: `https://www.linkedin.com/in/${input}/`,
    };
  }

  // Probably a name - need to search
  return null;
}

/**
 * Navigate to a LinkedIn profile
 *
 * Accepts flexible input:
 * - LinkedIn URL: https://linkedin.com/in/username
 * - Profile ID: username
 * - Name + Company: "John Doe at Acme Corp"
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {Object} input - Profile identifier
 * @param {string} input.profileUrl - Direct profile URL
 * @param {string} input.profileId - Profile ID
 * @param {string} input.personName - Person's name (for search)
 * @param {string} input.companyName - Company name (for search)
 * @returns {Promise<Object>} Navigation result
 */
export async function navigateToProfile(session, input = {}) {
  let { profileUrl, profileId, personName, companyName } = input;

  await session.ensureLoggedIn();

  // Try to parse URL or ID
  const parsed = parseProfileInput(profileUrl || profileId);

  if (parsed) {
    profileUrl = parsed.profileUrl;
    profileId = parsed.profileId;
  } else if (personName) {
    // Need to search for the person
    console.log(`[LinkedIn] Searching for: ${personName}${companyName ? ` at ${companyName}` : ''}...`);

    const searchQuery = companyName ? `${personName} ${companyName}` : personName;
    const searchResults = await searchPeople(session, { query: searchQuery, limit: 5 });

    if (searchResults.ok && searchResults.results.length > 0) {
      // Find best match
      const match = findBestMatch(searchResults.results, personName, companyName);
      if (match && match.profileUrl) {
        profileUrl = match.profileUrl;
        profileId = match.profileId;
        console.log(`[LinkedIn] Found match: ${match.name}`);
      } else {
        return {
          ok: false,
          error: `Could not find profile for: ${personName}`,
        };
      }
    } else {
      return {
        ok: false,
        error: `No search results for: ${personName}`,
      };
    }
  } else {
    return {
      ok: false,
      error: "Must provide profileUrl, profileId, or personName",
    };
  }

  // Navigate to profile
  console.log(`[LinkedIn] Navigating to profile: ${profileUrl}`);
  await session.throttle('profileView');
  await session.page.goto(profileUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Scroll to load content
  await session._humanScroll();
  await sleep(1000);

  return {
    ok: true,
    profileUrl,
    profileId,
  };
}

/**
 * Find best matching profile from search results
 */
function findBestMatch(results, personName, companyName) {
  const nameLower = personName.toLowerCase();
  const companyLower = companyName?.toLowerCase();

  // Score each result
  const scored = results.map(r => {
    let score = 0;

    // Name match
    const resultName = r.name?.toLowerCase() || '';
    if (resultName === nameLower) score += 10;
    else if (resultName.includes(nameLower) || nameLower.includes(resultName)) score += 5;
    else {
      // Check for partial name match (first name, last name)
      const nameParts = nameLower.split(' ');
      const resultParts = resultName.split(' ');
      for (const part of nameParts) {
        if (resultParts.some(rp => rp.includes(part) || part.includes(rp))) {
          score += 2;
        }
      }
    }

    // Company match
    if (companyLower) {
      const resultCompany = (r.currentCompany || r.headline || '').toLowerCase();
      if (resultCompany.includes(companyLower) || companyLower.includes(resultCompany)) {
        score += 5;
      }
    }

    return { ...r, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Return best match if score is reasonable
  if (scored[0]?.score >= 2) {
    return scored[0];
  }

  // Otherwise return first result as fallback
  return results[0];
}

/**
 * Extract detailed profile information
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {string} profileUrl - Profile URL to extract (must already be navigated to)
 * @returns {Promise<Object>} Full profile data
 */
export async function extractProfile(session, profileUrl = null) {
  await session.ensureLoggedIn();

  // Navigate if URL provided
  if (profileUrl) {
    const navResult = await navigateToProfile(session, { profileUrl });
    if (!navResult.ok) {
      return navResult;
    }
  }

  const currentUrl = session.page.url();
  const profileId = currentUrl.match(/\/in\/([^\/\?]+)/)?.[1];

  console.log(`[LinkedIn] Extracting profile data...`);

  // Scroll to load all sections
  for (let i = 0; i < 4; i++) {
    await session._humanScroll();
    await sleep(800);
  }

  // Click "Show more" buttons to expand content
  try {
    // Expand About section
    await session.stagehand.act("click 'see more' or 'show more' in the About section if visible");
    await sleep(500);
  } catch (e) {
    // Section may not have more content
  }

  try {
    // Expand Experience section
    await session.stagehand.act("click to show all experience entries if there's a 'Show all' button");
    await sleep(500);
  } catch (e) {
    // May already be expanded
  }

  // Extract basic info
  const basicInfo = await session.stagehand.extract({
    instruction: `Extract the person's basic profile information:
- Full name
- Headline/title
- Location
- About/summary section (full text)
- Number of connections or followers
- Whether you are connected to them (look for "1st", "2nd", "3rd" or "Connect" button)
- Current job title and company`,
    schema: z.object({
      name: z.string(),
      headline: z.string().optional(),
      location: z.string().optional(),
      about: z.string().optional(),
      connections: z.string().optional(),
      followers: z.string().optional(),
      connectionDegree: z.string().optional(),
      isConnected: z.boolean().optional(),
      currentTitle: z.string().optional(),
      currentCompany: z.string().optional(),
    }),
  });

  // Extract experience
  let experience = [];
  try {
    const expData = await session.stagehand.extract({
      instruction: `Extract the work experience section. For each position, get:
- Job title
- Company name
- Duration (e.g., "2 yrs 3 mos")
- Date range (e.g., "Jan 2020 - Present")
- Location if shown
- Brief description if visible`,
      schema: z.object({
        experience: z.array(z.object({
          title: z.string(),
          company: z.string(),
          duration: z.string().optional(),
          dateRange: z.string().optional(),
          location: z.string().optional(),
          description: z.string().optional(),
        })),
      }),
    });
    experience = expData?.experience || [];
  } catch (e) {
    console.log("[LinkedIn] Could not extract experience");
  }

  // Extract education
  let education = [];
  try {
    const eduData = await session.stagehand.extract({
      instruction: `Extract the education section. For each entry, get:
- School/university name
- Degree and field of study
- Years attended`,
      schema: z.object({
        education: z.array(z.object({
          school: z.string(),
          degree: z.string().optional(),
          dateRange: z.string().optional(),
        })),
      }),
    });
    education = eduData?.education || [];
  } catch (e) {
    console.log("[LinkedIn] Could not extract education");
  }

  // Extract skills (top skills)
  let skills = [];
  try {
    const skillsData = await session.stagehand.extract({
      instruction: "Extract the top skills listed on the profile (usually shown in a skills section)",
      schema: z.object({
        skills: z.array(z.string()),
      }),
    });
    skills = skillsData?.skills || [];
  } catch (e) {
    console.log("[LinkedIn] Could not extract skills");
  }

  // Determine connection status
  let connectionStatus = 'unknown';
  if (basicInfo.isConnected) {
    connectionStatus = 'connected';
  } else if (basicInfo.connectionDegree?.includes('1st')) {
    connectionStatus = 'connected';
  } else if (basicInfo.connectionDegree?.includes('2nd') || basicInfo.connectionDegree?.includes('3rd')) {
    connectionStatus = 'not_connected';
  }

  // Check for pending connection
  let isPending = false;
  try {
    const pageContent = await session.page.content();
    if (pageContent.toLowerCase().includes('pending') || pageContent.includes('Withdraw')) {
      isPending = true;
      connectionStatus = 'pending';
    }
  } catch (e) {
    // Ignore
  }

  const profile = {
    ...basicInfo,
    profileUrl: currentUrl,
    profileId,
    experience,
    education,
    skills,
    connectionStatus,
    isPending,
    extractedAt: new Date().toISOString(),
  };

  console.log(`[LinkedIn] Extracted profile: ${profile.name}`);

  return {
    ok: true,
    profile,
  };
}

/**
 * Get connection status for a profile
 */
export async function getConnectionStatus(session, profileUrl) {
  const navResult = await navigateToProfile(session, { profileUrl });
  if (!navResult.ok) {
    return { ok: false, error: navResult.error };
  }

  try {
    const status = await session.stagehand.extract({
      instruction: `Determine the connection status with this person:
- Are you connected (1st degree connection)?
- Is there a pending connection request?
- Can you send a connection request (is there a Connect button)?
- Can you message them directly?`,
      schema: z.object({
        status: z.enum(["connected", "pending", "not_connected", "unknown"]),
        canMessage: z.boolean().optional(),
        canConnect: z.boolean().optional(),
      }),
    });

    return {
      ok: true,
      ...status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      status: 'unknown',
    };
  }
}

export default {
  navigateToProfile,
  extractProfile,
  getConnectionStatus,
};
