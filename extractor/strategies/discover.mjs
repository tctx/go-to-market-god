/**
 * Menu Discovery Strategy
 * AI-powered detection of where menus live on restaurant websites
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Search for menu URL using web search
 * This is often faster than navigating through the site
 */
export async function searchForMenuUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname.replace('www.', '');
    const searchQuery = `${hostname} menu prices`;

    // Use a simple search approach - check common menu paths first
    const commonPaths = [
      '/menu',
      '/food-menu',
      '/our-menu',
      '/order',
      '/order-online',
    ];

    // Return suggestions for common paths
    return {
      success: true,
      suggestedPaths: commonPaths,
      searchQuery,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Quick probe to find a working menu URL
 * Checks common paths in parallel for speed
 */
export async function quickProbeMenuPaths(page, baseUrl) {
  const paths = ['/menu', '/our-menu', '/food', '/order', '/food-menu'];

  for (const path of paths) {
    try {
      const url = new URL(path, baseUrl).href;
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 8000,
      });

      if (response && response.status() === 200) {
        // Quick check for prices on page
        const hasMenuContent = await page.evaluate(() => {
          const text = document.body.innerText;
          const pricePattern = /\$\d+(\.\d{2})?/;
          return pricePattern.test(text) && text.length > 1000;
        });

        if (hasMenuContent) {
          return { success: true, path, url };
        }
      }
    } catch {
      continue;
    }
  }

  return { success: false };
}

/**
 * Common menu URL patterns to check
 */
const MENU_PATHS = [
  '/menu',
  '/our-menu',
  '/food',
  '/food-menu',
  '/food-drink',
  '/food-and-drink',
  '/order',
  '/order-online',
  '/order-now',
  '/eat',
  '/dine',
  '/offerings',
];

/**
 * Known external ordering platforms
 */
const ORDERING_PLATFORMS = {
  toast: {
    pattern: /order\.toasttab\.com/i,
    name: 'Toast',
  },
  square: {
    pattern: /squareup\.com\/store|order\.squaresandbox\.com/i,
    name: 'Square',
  },
  olo: {
    pattern: /olo\.com/i,
    name: 'Olo',
  },
  doordash: {
    pattern: /doordash\.com/i,
    name: 'DoorDash',
  },
  ubereats: {
    pattern: /ubereats\.com/i,
    name: 'Uber Eats',
  },
  grubhub: {
    pattern: /grubhub\.com/i,
    name: 'Grubhub',
  },
  chownow: {
    pattern: /chownow\.com|ordering\.chownow\.com/i,
    name: 'ChowNow',
  },
  popmenu: {
    pattern: /popmenu\.com/i,
    name: 'PopMenu',
  },
};

/**
 * Detect if a URL is an external ordering platform
 */
export function detectOrderingPlatform(url) {
  for (const [key, platform] of Object.entries(ORDERING_PLATFORMS)) {
    if (platform.pattern.test(url)) {
      return { platform: key, name: platform.name };
    }
  }
  return null;
}

/**
 * Analyze a page to discover menu location
 * Uses Stagehand's observe() to understand the page
 */
export async function discoverMenuLocation(stagehand, baseUrl) {
  const result = {
    menuType: null,
    menuPath: null,
    needsLocationSelection: false,
    externalUrl: null,
    pdfUrl: null,
    navigationSteps: [],
    confidence: 0,
  };

  try {
    const page = stagehand.context.pages()[0];

    // Get all links on the page
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors.map(a => ({
        href: a.href,
        text: a.innerText.trim().toLowerCase(),
        classes: a.className,
      }));
    });

    // Look for menu-related links
    const menuLinks = links.filter(link =>
      link.text.includes('menu') ||
      link.text.includes('order') ||
      link.text.includes('food') ||
      link.href.includes('/menu') ||
      link.href.includes('/order') ||
      link.href.includes('/food')
    );

    // Check for external ordering platforms
    for (const link of menuLinks) {
      const platform = detectOrderingPlatform(link.href);
      if (platform) {
        result.menuType = 'external';
        result.externalUrl = link.href;
        result.navigationSteps = [`Navigate to ${platform.name} ordering page`];
        result.confidence = 0.9;
        return result;
      }
    }

    // Check for PDF menu links
    const pdfLinks = links.filter(link =>
      link.href.endsWith('.pdf') &&
      (link.text.includes('menu') || link.href.toLowerCase().includes('menu'))
    );
    if (pdfLinks.length > 0) {
      result.menuType = 'pdf';
      result.pdfUrl = pdfLinks[0].href;
      result.confidence = 0.9;
      return result;
    }

    // Check for ordering flow indicators FIRST (higher priority than static menu)
    // Many restaurant sites have both Menu links AND ordering - prefer ordering for prices
    const orderLinks = menuLinks.filter(link =>
      link.text.includes('order') ||
      link.text.includes('pickup') ||
      link.text.includes('delivery')
    );

    // Also check if homepage has ordering-related text
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const hasOrderingPatterns = pageText.includes('order online') ||
                                pageText.includes('order now') ||
                                pageText.includes('start order') ||
                                pageText.includes('pickup') && pageText.includes('delivery');

    if (orderLinks.length > 0 || hasOrderingPatterns) {
      result.menuType = 'ordering_flow';
      result.needsLocationSelection = true;
      result.navigationSteps = [
        'Click on Order/Order Online button',
        'Select Pickup or Delivery',
        'Search for or select a location',
        'View menu with prices',
      ];
      result.confidence = 0.8;
      return result;
    }

    // Check for direct menu page link (only if no ordering flow detected)
    const directMenuLinks = menuLinks.filter(link =>
      link.text === 'menu' ||
      link.text === 'our menu' ||
      link.text === 'view menu' ||
      link.href.endsWith('/menu')
    );
    if (directMenuLinks.length > 0) {
      const menuUrl = new URL(directMenuLinks[0].href, baseUrl);
      result.menuType = 'static';
      result.menuPath = menuUrl.pathname;
      result.navigationSteps = ['Click on Menu link'];
      result.confidence = 0.75;
      return result;
    }

    // Use AI to analyze the page if no clear indicators
    const observation = await stagehand.observe({
      instruction: `Look at this restaurant website and tell me:
1. Where can I find the food menu? Is there a menu link, button, or section?
2. Does this site require location selection before showing the menu?
3. Are there any "Order Online", "Order Pickup", or "Order Now" buttons?
4. Is there a PDF menu link?
Return the most likely way to access the menu.`,
    });

    // Parse AI observation
    if (observation && observation.length > 0) {
      const obs = observation[0];
      if (obs.description) {
        const desc = obs.description.toLowerCase();

        if (desc.includes('order') && desc.includes('location')) {
          result.menuType = 'ordering_flow';
          result.needsLocationSelection = true;
          result.navigationSteps = [
            'Click on Order button',
            'Enter location and search',
            'Select a location',
          ];
          result.confidence = 0.6;
        } else if (desc.includes('menu')) {
          result.menuType = 'static';
          result.navigationSteps = ['Navigate to menu section'];
          result.confidence = 0.6;
        }
      }
    }

    // Fallback: try common menu paths
    if (!result.menuType) {
      result.menuType = 'probe';
      result.navigationSteps = MENU_PATHS.map(path => `Try ${path}`);
      result.confidence = 0.3;
    }

    return result;
  } catch (error) {
    console.error('Discovery error:', error.message);
    result.menuType = 'probe';
    result.navigationSteps = MENU_PATHS.map(path => `Try ${path}`);
    result.confidence = 0.2;
    return result;
  }
}

/**
 * Probe common menu paths to find a working one
 */
export async function probeMenuPaths(page, baseUrl) {
  for (const path of MENU_PATHS) {
    try {
      const url = new URL(path, baseUrl).href;
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      if (response && response.status() === 200) {
        // Check if page has menu-like content
        const hasMenuContent = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          const pricePattern = /\$\d+(\.\d{2})?/;
          return pricePattern.test(text) && text.length > 500;
        });

        if (hasMenuContent) {
          return { success: true, path, url };
        }
      }
    } catch {
      continue;
    }
  }

  return { success: false, path: null, url: null };
}

export default {
  discoverMenuLocation,
  detectOrderingPlatform,
  probeMenuPaths,
  MENU_PATHS,
  ORDERING_PLATFORMS,
};
