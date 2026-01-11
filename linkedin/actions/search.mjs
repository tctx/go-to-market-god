/**
 * LinkedIn Search Actions
 *
 * Search for people by query, company, role, location, etc.
 */

import { z } from "zod";
import { ProfileSummarySchema, SearchResultsSchema, CompanyPeopleSchema } from "../schemas/profile.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Build LinkedIn search URL with filters
 */
function buildSearchUrl(options) {
  const params = new URLSearchParams();

  if (options.query) {
    params.set('keywords', options.query);
  }

  // Company filter (requires company LinkedIn ID, but we can use name search)
  if (options.company) {
    params.set('company', options.company);
  }

  // Location filter
  if (options.location) {
    params.set('geoUrn', options.location);
  }

  // Network filter (1st, 2nd, 3rd connections)
  if (options.network) {
    params.set('network', JSON.stringify(options.network));
  }

  // Title filter
  if (options.title) {
    params.set('title', options.title);
  }

  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/**
 * Search for people on LinkedIn
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {Object} options - Search options
 * @param {string} options.query - Search query (name, title, keywords)
 * @param {string} options.company - Company name to filter by
 * @param {string} options.location - Location to filter by
 * @param {string} options.title - Job title to filter by
 * @param {number} options.limit - Max results to return (default: 10)
 * @returns {Promise<Object>} Search results
 */
export async function searchPeople(session, options = {}) {
  const { query, company, location, title, limit = 10 } = options;

  await session.ensureLoggedIn();
  await session.throttle('search');

  // Build search URL
  let searchUrl;
  if (query && company) {
    // Search with both query and company filter
    searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query + ' ' + company)}`;
  } else if (query) {
    searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  } else if (company) {
    searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`;
  } else {
    throw new Error("Either query or company is required for search");
  }

  console.log(`[LinkedIn] Searching: ${query || company}...`);
  await session.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Scroll to load more results
  for (let i = 0; i < 3; i++) {
    await session._humanScroll();
    await sleep(1000);
  }

  // Extract search results
  const instruction = `Extract up to ${limit} people from the search results. For each person, get their name, headline/title, current company, location, profile URL, and connection degree (1st, 2nd, 3rd).`;

  try {
    const results = await session.stagehand.extract({
      instruction,
      schema: z.object({
        profiles: z.array(z.object({
          name: z.string(),
          headline: z.string().optional(),
          currentCompany: z.string().optional(),
          currentTitle: z.string().optional(),
          location: z.string().optional(),
          profileUrl: z.string().optional(),
          connectionDegree: z.string().optional(),
        })),
        totalResults: z.string().optional(),
      }),
    });

    // Clean up profile URLs and extract profile IDs
    const profiles = (results?.profiles || []).map(p => {
      let profileId = null;
      if (p.profileUrl) {
        const match = p.profileUrl.match(/\/in\/([^\/\?]+)/);
        if (match) {
          profileId = match[1];
          p.profileUrl = `https://www.linkedin.com/in/${profileId}/`;
        }
      }
      return {
        ...p,
        profileId,
      };
    }).slice(0, limit);

    console.log(`[LinkedIn] Found ${profiles.length} results`);

    return {
      ok: true,
      query: query || company,
      results: profiles,
      totalResults: results?.totalResults,
    };
  } catch (error) {
    console.error(`[LinkedIn] Search error: ${error.message}`);
    return {
      ok: false,
      error: error.message,
      results: [],
    };
  }
}

/**
 * Find people at a specific company
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {Object} options - Search options
 * @param {string} options.companyName - Company name
 * @param {string} options.companyUrl - LinkedIn company URL (alternative to name)
 * @param {string[]} options.roles - Filter by job roles (e.g., ["CEO", "CTO", "Marketing"])
 * @param {number} options.limit - Max results (default: 10)
 * @returns {Promise<Object>} Company employees
 */
export async function findPeopleAtCompany(session, options = {}) {
  const { companyName, companyUrl, roles = [], limit = 10 } = options;

  if (!companyName && !companyUrl) {
    throw new Error("Either companyName or companyUrl is required");
  }

  await session.ensureLoggedIn();
  await session.throttle('search');

  let companyPageUrl;

  if (companyUrl) {
    // Use provided URL directly
    companyPageUrl = companyUrl.includes('/company/') ? companyUrl : `https://www.linkedin.com/company/${companyUrl}/`;
  } else {
    // Search for company first
    console.log(`[LinkedIn] Searching for company: ${companyName}...`);
    await session.page.goto(`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`, {
      waitUntil: 'domcontentloaded',
    });
    await sleep(3000);

    // Click on the first company result
    try {
      await session.stagehand.act("click on the first company result");
      await sleep(3000);
      companyPageUrl = session.page.url();
    } catch (e) {
      console.log(`[LinkedIn] Could not find company: ${companyName}`);
      return {
        ok: false,
        error: `Company not found: ${companyName}`,
        employees: [],
      };
    }
  }

  // Navigate to company's people section
  console.log(`[LinkedIn] Navigating to company people...`);

  // Try to click "People" tab or navigate directly
  try {
    // First try the People tab
    await session.stagehand.act("click on the People tab or link");
    await sleep(3000);
  } catch (e) {
    // Try direct URL pattern
    const companyId = companyPageUrl.match(/\/company\/([^\/]+)/)?.[1];
    if (companyId) {
      await session.page.goto(`https://www.linkedin.com/company/${companyId}/people/`, {
        waitUntil: 'domcontentloaded',
      });
      await sleep(3000);
    }
  }

  // Apply role filters if specified
  if (roles.length > 0) {
    console.log(`[LinkedIn] Filtering by roles: ${roles.join(', ')}`);
    for (const role of roles) {
      try {
        // Try to use the title filter
        await session.stagehand.act(`filter by title "${role}" or search for "${role}"`);
        await sleep(2000);
        break; // Use first successful filter
      } catch (e) {
        // Continue to next role
      }
    }
  }

  // Scroll to load more results
  for (let i = 0; i < 3; i++) {
    await session._humanScroll();
    await sleep(1000);
  }

  // Extract employees
  const rolesHint = roles.length > 0 ? ` Focus on people with roles like: ${roles.join(', ')}.` : '';
  const instruction = `Extract up to ${limit} employees from this company page.${rolesHint} For each person, get their name, job title, headline, profile URL, and connection degree.`;

  try {
    const results = await session.stagehand.extract({
      instruction,
      schema: z.object({
        companyName: z.string().optional(),
        employees: z.array(z.object({
          name: z.string(),
          currentTitle: z.string().optional(),
          headline: z.string().optional(),
          location: z.string().optional(),
          profileUrl: z.string().optional(),
          connectionDegree: z.string().optional(),
        })),
        totalEmployees: z.string().optional(),
      }),
    });

    // Clean up and add company name
    const employees = (results?.employees || []).map(e => {
      let profileId = null;
      if (e.profileUrl) {
        const match = e.profileUrl.match(/\/in\/([^\/\?]+)/);
        if (match) {
          profileId = match[1];
          e.profileUrl = `https://www.linkedin.com/in/${profileId}/`;
        }
      }
      return {
        ...e,
        profileId,
        currentCompany: results?.companyName || companyName,
      };
    }).slice(0, limit);

    console.log(`[LinkedIn] Found ${employees.length} employees`);

    return {
      ok: true,
      companyName: results?.companyName || companyName,
      employees,
      totalEmployees: results?.totalEmployees,
    };
  } catch (error) {
    console.error(`[LinkedIn] Company search error: ${error.message}`);
    return {
      ok: false,
      error: error.message,
      employees: [],
    };
  }
}

/**
 * Advanced search with multiple filters
 */
export async function advancedSearch(session, options = {}) {
  const {
    keywords,
    firstName,
    lastName,
    title,
    company,
    school,
    location,
    industry,
    connectionOf,
    limit = 10,
  } = options;

  await session.ensureLoggedIn();
  await session.throttle('search');

  // Build advanced search URL
  const params = new URLSearchParams();

  if (keywords) params.set('keywords', keywords);
  if (firstName) params.set('firstName', firstName);
  if (lastName) params.set('lastName', lastName);
  if (title) params.set('titleFilter', title);
  if (company) params.set('company', company);
  if (school) params.set('school', school);

  const searchUrl = `https://www.linkedin.com/search/results/people/?${params.toString()}`;

  console.log(`[LinkedIn] Advanced search...`);
  await session.page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Use the same extraction as regular search
  return searchPeople(session, { query: keywords || '', limit });
}

export default {
  searchPeople,
  findPeopleAtCompany,
  advancedSearch,
};
