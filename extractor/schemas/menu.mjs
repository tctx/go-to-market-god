/**
 * Restaurant Menu Extraction Schema
 * For extracting structured menu data from restaurant websites
 */

import { z } from "zod";

export const menuItemSchema = z.object({
  name: z.string().describe("Name of the menu item"),
  description: z.string().optional().describe("Description of the item"),
  price: z.string().optional().describe("Price as displayed (e.g., '$12.99', '12', 'Market Price')"),
  dietaryInfo: z.array(z.string()).optional().describe("Dietary tags like vegetarian, vegan, gluten-free, etc."),
});

export const menuSectionSchema = z.object({
  sectionName: z.string().describe("Name of the menu section (e.g., 'Appetizers', 'Main Courses', 'Drinks')"),
  items: z.array(menuItemSchema).describe("Items in this section"),
});

export const menuSchema = z.object({
  restaurantName: z.string().optional().describe("Name of the restaurant"),
  menuSections: z.array(menuSectionSchema).describe("All menu sections found on the page"),
  lastUpdated: z.string().optional().describe("When the menu was last updated, if mentioned"),
  notes: z.string().optional().describe("Any general notes about the menu (hours, seasonal items, etc.)"),
});

export const menuPrompt = `
Extract the complete restaurant menu from this page.

Look for:
1. All menu sections (appetizers, starters, mains, entrees, sides, desserts, drinks, beverages, specials, etc.)
2. For each item: name, description (if available), and price
3. Any dietary information (V for vegetarian, VG for vegan, GF for gluten-free, etc.)
4. The restaurant name if visible
5. Any notes about hours, seasonal availability, or special instructions

Be thorough - capture every menu item you can find on the page.
If prices are not listed, leave the price field empty.
If an item has no description, leave description empty.
`.trim();

export default {
  schema: menuSchema,
  prompt: menuPrompt,
  name: "menu",
  description: "Extract restaurant menu with sections, items, prices, and dietary info",
};
