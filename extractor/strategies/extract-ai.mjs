/**
 * AI-Powered Menu Extraction
 * Uses LLM to understand and extract menu data from page content
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract menu using AI with detailed format
 * Returns structured menu with prices, ingredients, and options
 */
export async function extractMenuWithAI(pageContent, options = {}) {
  const { model = 'gpt-4.1-mini', brandName = null } = options;

  // Truncate content if too long
  const maxLength = 25000;
  const content = pageContent.length > maxLength
    ? pageContent.substring(0, maxLength) + '\n[Content truncated...]'
    : pageContent;

  const prompt = `You are extracting a restaurant menu from the following page content.

TASK: Extract ALL menu items, organized into logical sections. For each item, capture:
- base_price: The price as a number (e.g., 5.95, not "$5.95")
- ingredients: Array of ingredients/components (infer from description if not explicit)
- options: Object with customization options like size, add-ons, milk choices, etc.

For options, use this structure where applicable:
- size: { "option_name": price_modifier } e.g., {"12 oz": 0, "16 oz": 1.0}
- add_ons: { "item": price } e.g., {"Extra cheese": 1.50}
- milk_options: { "type": price_modifier } for coffee shops
- syrup_add_ons: { "flavor": price } for coffee shops

If multiple items share the same options, you can use "common_options" at the section level.

IMPORTANT:
- Group items into logical sections based on how the restaurant organizes them
- Use section names exactly as shown on the menu (e.g., "Espresso Bar", "Cold Brew", "Appetizers")
- If price shows a range like "$5-7", use the lower price as base_price
- If price shows "+" like "$5.95+", use 5.95 as base_price
- If no price is shown, use 0
- Include all variations as separate items if they have different prices

Return ONLY valid JSON in this exact format:
{
  "Section Name": {
    "Item Name": {
      "base_price": 5.95,
      "ingredients": ["ingredient 1", "ingredient 2"],
      "options": {
        "size": {"12 oz": 0, "16 oz": 1.0},
        "add_ons": {"Extra item": 0.75}
      }
    }
  }
}

PAGE CONTENT:
${content}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a menu extraction expert. You output only valid JSON, no explanations or markdown.'
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });

    const text = response.choices[0].message.content.trim();

    // Parse JSON, handling possible markdown code blocks
    let jsonText = text;
    if (text.startsWith('```')) {
      jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const menu = JSON.parse(jsonText);
    return {
      success: true,
      menu,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    return {
      success: false,
      menu: null,
      error: error.message,
    };
  }
}

/**
 * Extract menu using simpler format (just names, descriptions, prices)
 */
export async function extractMenuSimple(pageContent, options = {}) {
  const { model = 'gpt-4.1-mini' } = options;

  const maxLength = 20000;
  const content = pageContent.length > maxLength
    ? pageContent.substring(0, maxLength) + '\n[Content truncated...]'
    : pageContent;

  const prompt = `Extract the restaurant menu from this page content.

Return a JSON object with this structure:
{
  "sections": [
    {
      "title": "Section Name",
      "items": [
        {
          "name": "Item Name",
          "description": "Description text or ingredients",
          "price": "$5.95"
        }
      ]
    }
  ]
}

Rules:
- Keep prices exactly as shown (with $ sign)
- Use empty string "" for missing descriptions
- Group items into sections as shown on the menu
- Include ALL items you can find

PAGE CONTENT:
${content}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You extract menu data and return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const text = response.choices[0].message.content.trim();
    let jsonText = text;
    if (text.startsWith('```')) {
      jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const menu = JSON.parse(jsonText);
    return {
      success: true,
      menu,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    return {
      success: false,
      menu: null,
      error: error.message,
    };
  }
}

/**
 * Use Stagehand extract for schema-based extraction
 */
export async function extractWithStagehand(stagehand, prompt, schema) {
  try {
    const data = await stagehand.extract(prompt, schema);
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Fallback regex-based extraction for simple menus
 */
export function extractMenuFallback(pageContent) {
  const lines = pageContent.split('\n').map(l => l.trim()).filter(l => l);
  const sections = [];
  let currentSection = { title: 'Menu', items: [] };

  // Price pattern
  const pricePattern = /\$[\d.]+(?:\+|-[\d.]+)?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    // Skip short lines and UI elements
    if (line.length < 2 || line.length > 100) continue;
    if (['ADD', 'Cart', 'Order', 'Checkout', 'Sign In'].includes(line)) continue;

    // Check if this looks like a section header
    const isHeader = !pricePattern.test(line) &&
                     line.length < 40 &&
                     (line === line.toUpperCase() || /^[A-Z]/.test(line));

    if (isHeader && currentSection.items.length > 0) {
      sections.push(currentSection);
      currentSection = { title: line, items: [] };
      continue;
    }

    // Check for price on this line or next
    const priceMatch = line.match(pricePattern) || nextLine.match(pricePattern);
    if (priceMatch && !isHeader) {
      const name = line.replace(pricePattern, '').trim();
      if (name.length > 1 && name.length < 60) {
        currentSection.items.push({
          name,
          description: '',
          price: priceMatch[0],
        });
      }
    }
  }

  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  return { sections };
}

export default {
  extractMenuWithAI,
  extractMenuSimple,
  extractWithStagehand,
  extractMenuFallback,
};
