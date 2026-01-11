/**
 * Stagehand Client Wrapper
 * Handles browser automation with Stagehand for AI-powered extraction
 * Supports local browser (default) with optional Browserbase cloud fallback
 */

import { Stagehand } from "@browserbasehq/stagehand";

/**
 * Create a Stagehand instance configured for extraction
 * @param {Object} options
 * @param {string} options.env - "LOCAL" (default) or "BROWSERBASE"
 * @param {boolean} options.headless - Run browser headless (default: true)
 * @param {number} options.timeout - Default timeout in ms (default: 60000)
 * @returns {Promise<Stagehand>}
 */
export async function createExtractor(options = {}) {
  const {
    env = "LOCAL",
    headless = true,
    timeout = 60000,
  } = options;

  const config = {
    env,
    verbose: 0,
    enableCaching: true,
  };

  if (env === "LOCAL") {
    config.localBrowserLaunchOptions = {
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
  } else if (env === "BROWSERBASE") {
    // Browserbase cloud config
    config.apiKey = process.env.BROWSERBASE_API_KEY;
    config.projectId = process.env.BROWSERBASE_PROJECT_ID;
  }

  // Configure the AI model - use OpenAI for cost-effectiveness
  if (process.env.OPENAI_API_KEY) {
    config.modelName = "gpt-4.1-mini";
    config.modelClientOptions = {
      apiKey: process.env.OPENAI_API_KEY,
    };
  } else if (process.env.ANTHROPIC_API_KEY) {
    config.modelName = "claude-3-5-sonnet-latest";
    config.modelClientOptions = {
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  } else {
    throw new Error("No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
  }

  const stagehand = new Stagehand(config);
  await stagehand.init();

  return stagehand;
}

/**
 * Navigate to a URL and extract data using natural language
 * @param {Stagehand} stagehand - Initialized Stagehand instance
 * @param {string} url - URL to navigate to
 * @param {string} prompt - Natural language extraction prompt
 * @param {import('zod').ZodSchema} schema - Zod schema for validation
 * @param {Object} options
 * @param {number} options.timeout - Navigation timeout in ms
 * @param {boolean} options.waitForNetworkIdle - Wait for network to be idle
 * @returns {Promise<Object>} Extracted and validated data
 */
export async function extractFromPage(stagehand, url, prompt, schema, options = {}) {
  const {
    timeout = 30000,
    waitForNetworkIdle = true,
  } = options;

  const page = stagehand.context.pages()[0];

  // Navigate to the URL
  await page.goto(url, {
    waitUntil: waitForNetworkIdle ? "networkidle" : "domcontentloaded",
    timeout,
  });

  // Use Stagehand's AI-powered extraction
  const result = await stagehand.extract(prompt, schema);

  return result;
}

/**
 * Extract data with automatic retry and fallback to Browserbase
 * @param {string} url - URL to extract from
 * @param {string} prompt - Extraction prompt
 * @param {import('zod').ZodSchema} schema - Zod schema
 * @param {Object} options
 * @param {string} options.preferredEnv - Preferred environment ("LOCAL" or "BROWSERBASE")
 * @param {boolean} options.fallbackToCloud - Whether to fallback to Browserbase on local failure
 * @param {number} options.retries - Number of retries (default: 2)
 * @returns {Promise<{data: Object, env: string, attempts: number}>}
 */
export async function extractWithFallback(url, prompt, schema, options = {}) {
  const {
    preferredEnv = "LOCAL",
    fallbackToCloud = true,
    retries = 2,
    headless = true,
    timeout = 60000,
  } = options;

  let lastError = null;
  let attempts = 0;

  // Try preferred environment first
  for (let i = 0; i < retries; i++) {
    attempts++;
    let stagehand = null;

    try {
      stagehand = await createExtractor({ env: preferredEnv, headless, timeout });
      const data = await extractFromPage(stagehand, url, prompt, schema, { timeout });
      await stagehand.close();
      return { data, env: preferredEnv, attempts };
    } catch (error) {
      lastError = error;
      if (stagehand) {
        try {
          await stagehand.close();
        } catch (_) {}
      }
    }
  }

  // Fallback to Browserbase if local failed
  if (fallbackToCloud && preferredEnv === "LOCAL" && process.env.BROWSERBASE_API_KEY) {
    for (let i = 0; i < retries; i++) {
      attempts++;
      let stagehand = null;

      try {
        stagehand = await createExtractor({ env: "BROWSERBASE", timeout });
        const data = await extractFromPage(stagehand, url, prompt, schema, { timeout });
        await stagehand.close();
        return { data, env: "BROWSERBASE", attempts };
      } catch (error) {
        lastError = error;
        if (stagehand) {
          try {
            await stagehand.close();
          } catch (_) {}
        }
      }
    }
  }

  throw new Error(`Extraction failed after ${attempts} attempts: ${lastError?.message || "Unknown error"}`);
}

/**
 * Close a Stagehand instance safely
 * @param {Stagehand} stagehand
 */
export async function closeExtractor(stagehand) {
  if (stagehand) {
    try {
      await stagehand.close();
    } catch (_) {}
  }
}
