/**
 * Menu Normalizer
 * Transforms raw extracted menu data into SF format
 */

/**
 * Generate a URL-friendly slug from a string
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalize price to consistent format
 * @param {string|number} price
 * @returns {string}
 */
function normalizePrice(price) {
  if (typeof price === 'number') {
    return `$${price.toFixed(2)}`;
  }
  if (!price) return '';

  const str = String(price).trim();

  // Already formatted
  if (str.startsWith('$')) return str;

  // Handle "Market Price", "Price Varies", etc.
  if (str.match(/market|varies|seasonal/i)) {
    return str;
  }

  // Try to parse as number
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (!isNaN(num)) {
    return `$${num.toFixed(2)}`;
  }

  return str;
}

/**
 * Normalize to simple SF format (sections with items)
 * Used for basic menu display
 */
export function normalizeToSimpleFormat(rawMenu, sourceUrl) {
  const sections = [];

  for (const [sectionName, sectionData] of Object.entries(rawMenu)) {
    const items = [];

    for (const [itemName, itemData] of Object.entries(sectionData)) {
      // Skip common_options entries
      if (itemName === 'common_options') continue;

      items.push({
        name: itemName,
        description: itemData.ingredients?.join(', ') || '',
        price: normalizePrice(itemData.base_price),
      });
    }

    if (items.length > 0) {
      sections.push({
        id: slugify(sectionName),
        title: sectionName,
        items,
      });
    }
  }

  return {
    brand: extractBrandFromUrl(sourceUrl),
    source_url: sourceUrl,
    last_updated: new Date().toISOString(),
    sections,
  };
}

/**
 * Normalize to detailed SF format (with options, ingredients, base_price)
 * Used for full menu data including customization options
 */
export function normalizeToDetailedFormat(rawMenu, sourceUrl, brandName = null) {
  const result = {};

  for (const [sectionName, sectionData] of Object.entries(rawMenu)) {
    result[sectionName] = {};

    // Check for common_options in this section
    const commonOptions = sectionData.common_options || null;

    for (const [itemName, itemData] of Object.entries(sectionData)) {
      // Skip common_options entries
      if (itemName === 'common_options') continue;

      const item = {
        base_price: typeof itemData.base_price === 'number'
          ? itemData.base_price
          : parseFloat(itemData.base_price) || 0,
        ingredients: itemData.ingredients || [],
        options: {},
      };

      // Handle options
      if (itemData.options) {
        if (itemData.options === 'uses common_options' && commonOptions) {
          item.options = { ...commonOptions };
        } else if (typeof itemData.options === 'object') {
          item.options = itemData.options;
        }
      }

      result[sectionName][itemName] = item;
    }

    // Include common_options in the section if present
    if (commonOptions) {
      result[sectionName].common_options = commonOptions;
    }
  }

  return {
    _metadata: {
      brand: brandName || extractBrandFromUrl(sourceUrl),
      source_url: sourceUrl,
      last_updated: new Date().toISOString(),
      format_version: '2.0',
    },
    ...result,
  };
}

/**
 * Extract brand name from URL
 */
function extractBrandFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and common TLDs
    const name = hostname
      .replace(/^www\./, '')
      .replace(/\.(com|net|org|io|co|restaurant|coffee|cafe|food|menu).*$/, '');
    // Title case
    return name
      .split(/[-.]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return 'Unknown';
  }
}

/**
 * Validate menu structure
 */
export function validateMenu(menu) {
  const errors = [];
  const warnings = [];

  if (!menu || typeof menu !== 'object') {
    errors.push('Menu must be an object');
    return { valid: false, errors, warnings };
  }

  let totalItems = 0;
  let itemsWithPrice = 0;
  let itemsWithIngredients = 0;

  for (const [sectionName, sectionData] of Object.entries(menu)) {
    if (sectionName.startsWith('_')) continue; // Skip metadata

    if (typeof sectionData !== 'object') {
      warnings.push(`Section "${sectionName}" is not an object`);
      continue;
    }

    for (const [itemName, itemData] of Object.entries(sectionData)) {
      if (itemName === 'common_options') continue;

      totalItems++;

      if (itemData.base_price !== undefined && itemData.base_price !== null) {
        itemsWithPrice++;
      } else {
        warnings.push(`"${itemName}" in "${sectionName}" has no price`);
      }

      if (itemData.ingredients && itemData.ingredients.length > 0) {
        itemsWithIngredients++;
      }
    }
  }

  if (totalItems === 0) {
    errors.push('Menu has no items');
  }

  if (itemsWithPrice < totalItems * 0.5) {
    warnings.push(`Only ${itemsWithPrice}/${totalItems} items have prices`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalItems,
      itemsWithPrice,
      itemsWithIngredients,
      sections: Object.keys(menu).filter(k => !k.startsWith('_')).length,
    },
  };
}

export default {
  normalizeToSimpleFormat,
  normalizeToDetailedFormat,
  validateMenu,
  slugify,
  normalizePrice,
};
