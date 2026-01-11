/**
 * Web Extraction Engine
 * Main orchestrator for AI-powered web data extraction
 *
 * Usage:
 *   import { extractFromUrl, extractBatch } from './extractor/index.mjs';
 *
 *   // Single URL extraction
 *   const result = await extractFromUrl('https://restaurant.com/menu', {
 *     preset: 'menu',  // or 'business-info' or 'custom'
 *   });
 *
 *   // Batch extraction
 *   const results = await extractBatch(['url1', 'url2'], {
 *     preset: 'menu',
 *     concurrency: 3,
 *   });
 */

import { extractWithFallback, createExtractor, closeExtractor } from "./stagehand-client.mjs";
import menuConfig from "./schemas/menu.mjs";
import businessInfoConfig from "./schemas/business-info.mjs";
import { createCustomExtraction } from "./schemas/custom.mjs";
import { writeExtractionToCompany, findCompanyByDomain } from "./outputs/hubspot.mjs";
import { huntMenu, huntMenuBatch } from "./menu-hunter.mjs";

// Preset configurations
const PRESETS = {
  menu: menuConfig,
  "business-info": businessInfoConfig,
};

/**
 * Get extraction config for a preset or custom extraction
 * @param {Object} options
 * @param {string} options.preset - Preset name ('menu', 'business-info', 'custom')
 * @param {string} options.customPrompt - Custom prompt (for custom preset)
 * @param {Object} options.outputFormat - Output format example or schema (for custom preset)
 * @returns {Object} Extraction config with schema and prompt
 */
function getExtractionConfig(options) {
  const { preset, customPrompt, outputFormat } = options;

  if (preset && preset !== "custom" && PRESETS[preset]) {
    return PRESETS[preset];
  }

  // Custom extraction
  return createCustomExtraction({
    prompt: customPrompt,
    outputFormat,
    name: "custom",
  });
}

/**
 * Extract data from a single URL
 * @param {string} url - URL to extract from
 * @param {Object} options
 * @param {string} options.preset - Preset type ('menu', 'business-info', 'custom')
 * @param {string} options.customPrompt - Custom extraction prompt
 * @param {Object} options.outputFormat - Custom output format/schema
 * @param {string} options.browserEnv - Browser environment ('LOCAL' or 'BROWSERBASE')
 * @param {boolean} options.fallbackToCloud - Whether to fallback to Browserbase
 * @param {boolean} options.headless - Run browser headless
 * @param {number} options.timeout - Extraction timeout in ms
 * @returns {Promise<Object>} Extraction result
 */
export async function extractFromUrl(url, options = {}) {
  const {
    preset = "custom",
    customPrompt,
    outputFormat,
    browserEnv = "LOCAL",
    fallbackToCloud = true,
    headless = true,
    timeout = 60000,
  } = options;

  const config = getExtractionConfig({ preset, customPrompt, outputFormat });
  const startTime = Date.now();

  try {
    const { data, env, attempts } = await extractWithFallback(
      url,
      config.prompt,
      config.schema,
      {
        preferredEnv: browserEnv,
        fallbackToCloud,
        headless,
        timeout,
      }
    );

    return {
      success: true,
      url,
      preset: config.name,
      data,
      metadata: {
        extractedAt: new Date().toISOString(),
        browserEnv: env,
        attempts,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      url,
      preset: config.name,
      error: error.message,
      metadata: {
        extractedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Extract data from multiple URLs with concurrency control
 * @param {string[]} urls - URLs to extract from
 * @param {Object} options
 * @param {string} options.preset - Preset type
 * @param {string} options.customPrompt - Custom extraction prompt
 * @param {Object} options.outputFormat - Custom output format
 * @param {number} options.concurrency - Max concurrent extractions (default: 3)
 * @param {string} options.browserEnv - Browser environment
 * @param {boolean} options.headless - Run browser headless
 * @param {Function} options.onProgress - Progress callback (index, total, result)
 * @returns {Promise<Object>} Batch results
 */
export async function extractBatch(urls, options = {}) {
  const {
    preset = "custom",
    customPrompt,
    outputFormat,
    concurrency = 3,
    browserEnv = "LOCAL",
    headless = true,
    timeout = 60000,
    onProgress,
  } = options;

  const results = [];
  const errors = [];
  const startTime = Date.now();

  // Process URLs in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (url, batchIndex) => {
        const result = await extractFromUrl(url, {
          preset,
          customPrompt,
          outputFormat,
          browserEnv,
          headless,
          timeout,
        });

        const index = i + batchIndex;
        if (onProgress) {
          onProgress(index, urls.length, result);
        }

        return result;
      })
    );

    for (const result of batchResults) {
      if (result.success) {
        results.push(result);
      } else {
        errors.push(result);
      }
    }
  }

  return {
    success: true,
    total: urls.length,
    successful: results.length,
    failed: errors.length,
    results,
    errors,
    metadata: {
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startTime,
      avgDurationMs: Math.round((Date.now() - startTime) / urls.length),
    },
  };
}

/**
 * Extract and write to HubSpot in one operation
 * @param {string} url - URL to extract from
 * @param {Object} options
 * @param {string} options.preset - Preset type
 * @param {string} options.hubspotToken - HubSpot API token
 * @param {string} options.companyId - HubSpot company ID (optional, will search by domain)
 * @returns {Promise<Object>} Result with extraction and HubSpot write status
 */
export async function extractAndWriteToHubspot(url, options = {}) {
  const { hubspotToken, companyId, ...extractOptions } = options;

  // First, extract the data
  const extractResult = await extractFromUrl(url, extractOptions);

  if (!extractResult.success) {
    return {
      ...extractResult,
      hubspotWritten: false,
    };
  }

  if (!hubspotToken) {
    return {
      ...extractResult,
      hubspotWritten: false,
      hubspotError: "No HubSpot token provided",
    };
  }

  try {
    let targetCompanyId = companyId;

    // If no company ID, try to find by domain
    if (!targetCompanyId) {
      const company = await findCompanyByDomain(hubspotToken, url);
      if (company) {
        targetCompanyId = company.id;
      }
    }

    if (!targetCompanyId) {
      return {
        ...extractResult,
        hubspotWritten: false,
        hubspotError: "No matching company found in HubSpot",
      };
    }

    // Write to HubSpot
    await writeExtractionToCompany(
      hubspotToken,
      targetCompanyId,
      extractResult.data,
      extractResult.preset
    );

    return {
      ...extractResult,
      hubspotWritten: true,
      hubspotCompanyId: targetCompanyId,
    };
  } catch (error) {
    return {
      ...extractResult,
      hubspotWritten: false,
      hubspotError: error.message,
    };
  }
}

/**
 * Parse URLs from CSV content
 * @param {string} csvContent - CSV file content
 * @param {string} urlColumn - Name of the URL column (default: auto-detect)
 * @returns {string[]} Array of URLs
 */
export function parseUrlsFromCsv(csvContent, urlColumn = null) {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  // Find URL column
  let urlIndex = -1;
  if (urlColumn) {
    urlIndex = headers.indexOf(urlColumn.toLowerCase());
  } else {
    // Auto-detect URL column
    const urlColumnNames = ["url", "website", "domain", "link", "site", "web"];
    for (const name of urlColumnNames) {
      const idx = headers.indexOf(name);
      if (idx !== -1) {
        urlIndex = idx;
        break;
      }
    }
  }

  if (urlIndex === -1) {
    // Try first column as URL
    urlIndex = 0;
  }

  const urls = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const url = cols[urlIndex]?.trim();
    if (url && (url.startsWith("http") || url.includes("."))) {
      urls.push(url.startsWith("http") ? url : `https://${url}`);
    }
  }

  return urls;
}

/**
 * Multi-step navigated extraction for complex sites (SPAs, ordering systems)
 * @param {Object} options
 * @param {string} options.startUrl - URL to start at
 * @param {string[]} options.steps - Natural language navigation steps
 * @param {string} options.preset - Extraction preset
 * @param {string} options.customPrompt - Custom prompt for extraction
 * @param {Function} options.parseContent - Custom parsing function (receives page text, returns structured data)
 * @returns {Promise<Object>} Extracted data
 */
export async function extractWithNavigation(options = {}) {
  const {
    startUrl,
    steps = [],
    preset = "custom",
    customPrompt,
    outputFormat,
    parseContent,
    browserEnv = "LOCAL",
    headless = true,
    timeout = 120000,
  } = options;

  const { Stagehand } = await import("@browserbasehq/stagehand");

  const stagehand = new Stagehand({
    env: browserEnv,
    localBrowserLaunchOptions: { headless },
    verbose: 0,
    modelName: "gpt-4.1-mini",
    modelClientOptions: { apiKey: process.env.OPENAI_API_KEY },
  });

  const startTime = Date.now();

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // Navigate to start URL
    await page.goto(startUrl, { waitUntil: "networkidle", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Execute each navigation step
    for (const step of steps) {
      try {
        await stagehand.act(step);
        await new Promise(r => setTimeout(r, 2000));
      } catch (stepError) {
        console.warn(`Step failed: ${step}`, stepError.message);
      }
    }

    // Wait for content to load
    await new Promise(r => setTimeout(r, 3000));

    // Get page content
    const pageText = await page.evaluate(() => document.body.innerText);
    const currentUrl = page.url();

    let data;

    // Use custom parser if provided
    if (parseContent) {
      data = parseContent(pageText);
    } else {
      // Use Stagehand extract for schema-based extraction
      const config = getExtractionConfig({ preset, customPrompt, outputFormat });
      try {
        data = await stagehand.extract(config.prompt, config.schema);
      } catch (extractError) {
        // Fallback to raw page text
        data = { rawContent: pageText.substring(0, 10000) };
      }
    }

    await stagehand.close();

    return {
      success: true,
      startUrl,
      finalUrl: currentUrl,
      stepsExecuted: steps.length,
      data,
      metadata: {
        extractedAt: new Date().toISOString(),
        browserEnv,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    try {
      await stagehand.close();
    } catch (_) {}

    return {
      success: false,
      startUrl,
      error: error.message,
      metadata: {
        extractedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Pre-built extraction for restaurant menus that require ordering flow
 * (like Torchy's, Chipotle, etc.)
 * @param {string} baseUrl - Restaurant website base URL
 * @param {string} location - Location to search for (city, zip, address)
 * @returns {Promise<Object>} Extracted menu with prices
 */
export async function extractRestaurantOrderingMenu(baseUrl, location = "Austin TX") {
  const parseMenu = (pageText) => {
    const lines = pageText.split("\n").map(l => l.trim()).filter(l => l);

    const result = {
      sections: []
    };

    // Common section names
    const sectionKeywords = [
      "Appetizers", "Starters", "Chips", "Dips",
      "Tacos", "Burritos", "Bowls", "Salads",
      "Entrees", "Mains", "Plates", "Combos",
      "Breakfast", "Brunch", "Lunch", "Dinner",
      "Kids", "Children",
      "Sides", "Extras",
      "Desserts", "Sweets",
      "Drinks", "Beverages", "Bar",
      "Limited Time", "Specials", "Featured"
    ];

    let currentSection = null;
    let currentItem = null;

    for (const line of lines) {
      // Check for section header
      const isSection = sectionKeywords.some(kw =>
        line.toLowerCase().includes(kw.toLowerCase())
      ) && line.length < 50;

      if (isSection && !line.match(/^\$/)) {
        if (currentSection && currentSection.items.length > 0) {
          result.sections.push(currentSection);
        }
        currentSection = { name: line, items: [] };
        currentItem = null;
        continue;
      }

      if (!currentSection) continue;

      // Skip UI elements
      if (["ADD", "Customize", "Menu", "Your Order", "Group Order", "Cart"].some(ui => line === ui)) continue;

      // Check for price
      const priceMatch = line.match(/^\$[\d.]+$/);
      if (priceMatch || line === "Price Varies") {
        if (currentItem) {
          currentItem.price = line;
          currentSection.items.push(currentItem);
          currentItem = null;
        }
        continue;
      }

      // New item
      if (!currentItem && line.length > 1 && line.length < 100) {
        const dietaryInfo = [];
        let name = line;
        if (name.includes("(V)")) {
          dietaryInfo.push("Vegetarian");
          name = name.replace("(V)", "").trim();
        }
        if (name.includes("(GF)")) {
          dietaryInfo.push("Gluten-Free");
          name = name.replace("(GF)", "").trim();
        }
        if (name.includes("(VG)")) {
          dietaryInfo.push("Vegan");
          name = name.replace("(VG)", "").trim();
        }
        currentItem = {
          name,
          ...(dietaryInfo.length > 0 && { dietaryInfo })
        };
      }
    }

    // Save last section
    if (currentSection && currentSection.items.length > 0) {
      result.sections.push(currentSection);
    }

    return result;
  };

  // Try common ordering flow patterns
  const steps = [
    `type ${location} in the location or search field and press Enter`,
    "click on Order Pickup or Order Now for the first location result"
  ];

  // Try locations page first (common pattern)
  let result = await extractWithNavigation({
    startUrl: `${baseUrl}/locations`,
    steps,
    parseContent: parseMenu,
  });

  // If that didn't work, try from homepage
  if (!result.success || result.data.sections.length === 0) {
    result = await extractWithNavigation({
      startUrl: baseUrl,
      steps: [
        "click on Order or Pickup button",
        ...steps
      ],
      parseContent: parseMenu,
    });
  }

  return result;
}

// Export presets for reference
export const presets = PRESETS;

// Export Menu Hunter
export { huntMenu, huntMenuBatch };

export default {
  extractFromUrl,
  extractBatch,
  extractAndWriteToHubspot,
  extractWithNavigation,
  extractRestaurantOrderingMenu,
  parseUrlsFromCsv,
  huntMenu,
  huntMenuBatch,
  presets,
};
