/**
 * Menu Navigation Strategy
 * Handles different types of menu access patterns
 */

import { probeMenuPaths } from './discover.mjs';

/**
 * Wait helper
 */
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Navigate to a static menu page
 */
export async function navigateToStaticMenu(page, baseUrl, menuPath) {
  const url = new URL(menuPath, baseUrl).href;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await wait(3000);

  // Scroll to load any lazy content
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight / 2);
  });
  await wait(1000);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await wait(1000);

  const content = await page.evaluate(() => document.body.innerText);
  return {
    success: true,
    content,
    finalUrl: page.url(),
  };
}

/**
 * Navigate through an ordering flow (location selection, pickup/delivery)
 */
export async function navigateOrderingFlow(stagehand, page, baseUrl, options = {}) {
  const { location = 'Austin TX' } = options;

  try {
    // Start from homepage to find ordering entry point
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(3000); // Give time for JS to load

    // Dismiss any popups/modals
    await dismissPopups(stagehand, page);

    // Step 1: Click on Order/Order Now if available
    const orderEntryActions = [
      'click on Order or Order Now button',
      'click on Order Online button',
      'click on Start Order button',
    ];

    for (const action of orderEntryActions) {
      try {
        await stagehand.act(action);
        await wait(2000);
        break;
      } catch {
        continue;
      }
    }

    // Step 2: Select Pickup if on order-type page
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());

    if (pageText.includes('pickup') && pageText.includes('delivery')) {
      try {
        await stagehand.act('click on Pickup or Order Pickup option');
        await wait(2000);
      } catch {
        // Try clicking the first option
        try {
          await stagehand.act('click on the first ordering option');
          await wait(2000);
        } catch {
          // Continue anyway
        }
      }
    }

    // Step 3: Enter location and search
    const locationActions = [
      `type "${location}" in the search field or location input and press Enter`,
      `type "${location}" in the address or zip code field and press Enter`,
      `search for "${location}"`,
    ];

    for (const action of locationActions) {
      try {
        await stagehand.act(action);
        await wait(3000);
        break;
      } catch {
        continue;
      }
    }

    // Step 4: Select the first location result
    const selectLocationActions = [
      'click on Order Pickup for the first location shown',
      'click on Start Order for the first location',
      'click on the first location result to select it',
      'click on Order Now for the first store',
    ];

    for (const action of selectLocationActions) {
      try {
        await stagehand.act(action);
        await wait(3000);
        break;
      } catch {
        continue;
      }
    }

    // Wait for menu to load
    await wait(3000);

    // Check if we're on a menu page (has prices)
    let content = await page.evaluate(() => document.body.innerText);
    const hasPrices = /\$\d+(\.\d{2})?/.test(content);

    if (!hasPrices) {
      // Try one more navigation - sometimes there's another step
      try {
        await stagehand.act('click on Menu or View Menu or Food Menu');
        await wait(2000);
      } catch {
        // Continue
      }
    }

    // Scroll to load all content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await wait(1500);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await wait(1500);

    content = await page.evaluate(() => document.body.innerText);
    const finalHasPrices = /\$\d+(\.\d{2})?/.test(content);

    return {
      success: content.length > 500 && finalHasPrices,
      content,
      finalUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      finalUrl: page.url(),
      error: error.message,
    };
  }
}

/**
 * Navigate to external ordering platform
 */
export async function navigateExternalMenu(page, externalUrl) {
  try {
    await page.goto(externalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await wait(3000);

    // Scroll to load menu items
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await wait(1500);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await wait(1500);

    const content = await page.evaluate(() => document.body.innerText);
    return {
      success: content.length > 500,
      content,
      finalUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      finalUrl: externalUrl,
      error: error.message,
    };
  }
}

/**
 * Extract text from PDF menu
 */
export async function extractPdfMenu(page, pdfUrl) {
  try {
    // For now, return a placeholder - PDF extraction would need pdf-parse
    // In production, download the PDF and use pdf-parse to extract text
    return {
      success: false,
      content: '',
      finalUrl: pdfUrl,
      error: 'PDF extraction not yet implemented - requires pdf-parse library',
      pdfUrl,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      finalUrl: pdfUrl,
      error: error.message,
    };
  }
}

/**
 * Probe multiple paths to find a working menu
 */
export async function navigateWithProbing(page, baseUrl) {
  const result = await probeMenuPaths(page, baseUrl);

  if (result.success) {
    // Already on the menu page from probing
    await wait(1000);

    // Scroll to load content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await wait(1000);

    const content = await page.evaluate(() => document.body.innerText);
    return {
      success: true,
      content,
      finalUrl: page.url(),
      probedPath: result.path,
    };
  }

  return {
    success: false,
    content: '',
    finalUrl: page.url(),
    error: 'No menu page found after probing common paths',
  };
}

/**
 * Dismiss common popups, modals, cookie banners
 */
async function dismissPopups(stagehand, page) {
  const dismissActions = [
    'close any popup or modal that is visible',
    'click X or close button on any overlay',
    'dismiss cookie consent banner if visible',
    'click Accept or Got it on any notification',
  ];

  for (const action of dismissActions) {
    try {
      await stagehand.act(action);
      await wait(500);
    } catch {
      // Ignore - no popup to dismiss
    }
  }
}

/**
 * Click through category tabs to get full menu
 */
export async function expandMenuCategories(stagehand, page) {
  try {
    // Look for category tabs/buttons
    const tabs = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="tab"], .category, .menu-category'));
      return buttons
        .filter(b => b.innerText.length < 30 && b.innerText.length > 0)
        .map(b => b.innerText.trim())
        .slice(0, 10); // Max 10 categories
    });

    let fullContent = '';

    for (const tab of tabs) {
      try {
        await stagehand.act(`click on the "${tab}" category or tab`);
        await wait(1500);

        const content = await page.evaluate(() => document.body.innerText);
        fullContent += `\n--- ${tab} ---\n${content}`;
      } catch {
        continue;
      }
    }

    return fullContent || await page.evaluate(() => document.body.innerText);
  } catch {
    return await page.evaluate(() => document.body.innerText);
  }
}

export default {
  navigateToStaticMenu,
  navigateOrderingFlow,
  navigateExternalMenu,
  extractPdfMenu,
  navigateWithProbing,
  expandMenuCategories,
};
