/**
 * Menu Hunter Agent
 * AI-driven menu discovery, navigation, extraction, and normalization
 *
 * Usage:
 *   import { huntMenu } from './extractor/menu-hunter.mjs';
 *
 *   const menu = await huntMenu('https://torchystacos.com', {
 *     location: 'Austin TX',
 *     format: 'detailed',  // or 'simple'
 *   });
 */

import { Stagehand } from '@browserbasehq/stagehand';
import { discoverMenuLocation, quickProbeMenuPaths } from './strategies/discover.mjs';
import {
  navigateToStaticMenu,
  navigateOrderingFlow,
  navigateExternalMenu,
  navigateWithProbing,
  expandMenuCategories,
} from './strategies/navigate.mjs';
import { extractMenuWithAI, extractMenuSimple, extractMenuFallback } from './strategies/extract-ai.mjs';
import { normalizeToDetailedFormat, normalizeToSimpleFormat, validateMenu } from './strategies/normalize.mjs';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Hunt for and extract a menu from any restaurant website
 *
 * @param {string} url - Restaurant website URL
 * @param {Object} options
 * @param {string} options.location - Location for ordering systems (default: 'Austin TX')
 * @param {string} options.format - Output format: 'detailed' or 'simple' (default: 'detailed')
 * @param {string} options.browserEnv - 'LOCAL' or 'BROWSERBASE' (default: 'LOCAL')
 * @param {boolean} options.headless - Run browser headless (default: true)
 * @param {string} options.model - LLM model for extraction (default: 'gpt-4.1-mini')
 * @param {number} options.timeout - Total timeout in ms (default: 120000)
 * @returns {Promise<Object>} Extracted menu in SF format
 */
export async function huntMenu(url, options = {}) {
  const {
    location = 'Austin TX',
    format = 'detailed',
    browserEnv = 'LOCAL',
    headless = true,
    model = 'gpt-4.1-mini',
    timeout = 120000,
  } = options;

  const startTime = Date.now();
  const phases = [];

  // Normalize URL
  let baseUrl = url;
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  // Remove trailing path for base operations
  const urlObj = new URL(baseUrl);
  const domain = `${urlObj.protocol}//${urlObj.host}`;

  // Initialize Stagehand
  const stagehand = new Stagehand({
    env: browserEnv,
    localBrowserLaunchOptions: { headless },
    verbose: 0,
    modelName: model,
    modelClientOptions: { apiKey: process.env.OPENAI_API_KEY },
  });

  try {
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // PHASE 1: DISCOVER (with quick probe optimization)
    phases.push({ phase: 'discover', startTime: Date.now() });

    // Try quick probe first - check common menu paths for prices
    console.log('[Menu Hunter] Quick probing common menu paths...');
    const quickProbe = await quickProbeMenuPaths(page, domain);

    let discovery;
    let pageContent = '';

    if (quickProbe.success) {
      // Found a menu with prices via quick probe!
      console.log(`[Menu Hunter] Quick probe found menu at ${quickProbe.path}`);
      discovery = {
        menuType: 'quick_probe',
        menuPath: quickProbe.path,
        confidence: 0.95,
      };

      // Scroll to load all content
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await wait(1500);

      pageContent = await page.evaluate(() => document.body.innerText);

      phases[0].result = discovery;
      phases[0].durationMs = Date.now() - phases[0].startTime;
      phases.push({ phase: 'navigate', startTime: Date.now(), result: { success: true, finalUrl: page.url() }, durationMs: 0 });

      // Skip to extraction
    } else {
      // Quick probe failed, do full discovery
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await wait(3000);
      } catch (navError) {
        console.warn('[Menu Hunter] Initial navigation failed, retrying...');
        await page.goto(baseUrl, { waitUntil: 'load', timeout: 30000 });
        await wait(3000);
      }

      discovery = await discoverMenuLocation(stagehand, domain);
      phases[0].result = discovery;
      phases[0].durationMs = Date.now() - phases[0].startTime;
    }

    console.log(`[Menu Hunter] Discovery: ${discovery.menuType} (confidence: ${discovery.confidence})`);

    // PHASE 2: NAVIGATE (skip if quick probe succeeded)
    let navResult;

    if (discovery.menuType === 'quick_probe') {
      // Already have content from quick probe
      navResult = { success: true, content: pageContent, finalUrl: page.url() };
    } else {
      phases.push({ phase: 'navigate', startTime: Date.now() });

      switch (discovery.menuType) {
        case 'static':
          navResult = await navigateToStaticMenu(page, domain, discovery.menuPath || '/menu');
          break;

        case 'ordering_flow':
          navResult = await navigateOrderingFlow(stagehand, page, domain, { location });
          break;

        case 'external':
          navResult = await navigateExternalMenu(page, discovery.externalUrl);
          break;

        case 'pdf':
          // For now, try to find an alternate menu location
          navResult = await navigateWithProbing(page, domain);
          if (!navResult.success) {
            navResult = {
              success: false,
              content: '',
              error: `PDF menu found at ${discovery.pdfUrl} - PDF extraction not yet implemented`,
              pdfUrl: discovery.pdfUrl,
            };
          }
          break;

        case 'probe':
        default:
          // Try probing common paths
          navResult = await navigateWithProbing(page, domain);
          if (!navResult.success) {
            // Last resort: try ordering flow
            navResult = await navigateOrderingFlow(stagehand, page, domain, { location });
          }
          break;
      }

      phases[phases.length - 1].result = { success: navResult.success, finalUrl: navResult.finalUrl };
      phases[phases.length - 1].durationMs = Date.now() - phases[phases.length - 1].startTime;

      if (!navResult.success) {
        await stagehand.close();
        return {
          success: false,
          url: baseUrl,
          error: navResult.error || 'Failed to navigate to menu',
          phases,
          metadata: {
            durationMs: Date.now() - startTime,
          },
        };
      }

      pageContent = navResult.content;
    }

    // Try to expand menu categories for full content
    try {
      const expandedContent = await expandMenuCategories(stagehand, page);
      if (expandedContent.length > pageContent.length) {
        pageContent = expandedContent;
      }
    } catch {
      // Use original content
    }

    console.log(`[Menu Hunter] Navigate: Got ${pageContent.length} chars from ${navResult.finalUrl}`);

    // PHASE 3: EXTRACT
    phases.push({ phase: 'extract', startTime: Date.now() });

    let extractResult;
    if (format === 'detailed') {
      extractResult = await extractMenuWithAI(pageContent, { model });
    } else {
      extractResult = await extractMenuSimple(pageContent, { model });
    }

    // Fallback to regex if AI fails
    if (!extractResult.success) {
      console.log('[Menu Hunter] AI extraction failed, using fallback parser');
      const fallbackMenu = extractMenuFallback(pageContent);
      extractResult = {
        success: fallbackMenu.sections?.length > 0,
        menu: fallbackMenu,
        error: extractResult.error,
        usedFallback: true,
      };
    }

    phases[2].result = {
      success: extractResult.success,
      tokensUsed: extractResult.tokensUsed,
      usedFallback: extractResult.usedFallback,
    };
    phases[2].durationMs = Date.now() - phases[2].startTime;

    if (!extractResult.success) {
      await stagehand.close();
      return {
        success: false,
        url: baseUrl,
        error: extractResult.error || 'Failed to extract menu',
        phases,
        metadata: {
          durationMs: Date.now() - startTime,
        },
      };
    }

    console.log(`[Menu Hunter] Extract: Got menu data`);

    // PHASE 4: NORMALIZE
    phases.push({ phase: 'normalize', startTime: Date.now() });

    let normalizedMenu;
    if (format === 'detailed') {
      normalizedMenu = normalizeToDetailedFormat(extractResult.menu, baseUrl);
    } else {
      normalizedMenu = normalizeToSimpleFormat(extractResult.menu, baseUrl);
    }

    // Validate
    const validation = validateMenu(normalizedMenu);

    phases[3].result = {
      valid: validation.valid,
      stats: validation.stats,
      warnings: validation.warnings,
    };
    phases[3].durationMs = Date.now() - phases[3].startTime;

    await stagehand.close();

    console.log(`[Menu Hunter] Complete: ${validation.stats.totalItems} items in ${validation.stats.sections} sections`);

    return {
      success: true,
      url: baseUrl,
      finalUrl: navResult.finalUrl,
      menu: normalizedMenu,
      validation,
      phases,
      metadata: {
        discoveryType: discovery.menuType,
        confidence: discovery.confidence,
        tokensUsed: extractResult.tokensUsed || 0,
        usedFallback: extractResult.usedFallback || false,
        durationMs: Date.now() - startTime,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    try {
      await stagehand.close();
    } catch {}

    return {
      success: false,
      url: baseUrl,
      error: error.message,
      phases,
      metadata: {
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Hunt menus from multiple URLs
 */
export async function huntMenuBatch(urls, options = {}) {
  const { concurrency = 2, ...huntOptions } = options;

  const results = [];
  const errors = [];
  const startTime = Date.now();

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(url => huntMenu(url, huntOptions))
    );

    for (const result of batchResults) {
      if (result.success) {
        results.push(result);
      } else {
        errors.push(result);
      }
    }

    // Progress log
    console.log(`[Menu Hunter Batch] Progress: ${Math.min(i + concurrency, urls.length)}/${urls.length}`);
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
    },
  };
}

export default {
  huntMenu,
  huntMenuBatch,
};
