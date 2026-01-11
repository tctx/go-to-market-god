/**
 * Business Information Extraction Schema
 * For extracting owner info, founding story, and business details
 */

import { z } from "zod";

export const socialLinksSchema = z.object({
  instagram: z.string().optional().describe("Instagram profile URL or handle"),
  facebook: z.string().optional().describe("Facebook page URL"),
  twitter: z.string().optional().describe("Twitter/X profile URL or handle"),
  linkedin: z.string().optional().describe("LinkedIn profile or company URL"),
  tiktok: z.string().optional().describe("TikTok profile URL or handle"),
  youtube: z.string().optional().describe("YouTube channel URL"),
});

export const businessInfoSchema = z.object({
  businessName: z.string().optional().describe("Name of the business"),
  ownerName: z.string().optional().describe("Name of the owner, founder, or proprietor"),
  ownerTitle: z.string().optional().describe("Title of the owner (Owner, Founder, CEO, Chef, etc.)"),
  foundingStory: z.string().optional().describe("The story of how and why the business was founded"),
  foundedYear: z.string().optional().describe("Year the business was founded or opened"),
  location: z.string().optional().describe("Physical address or location description"),
  city: z.string().optional().describe("City where the business is located"),
  state: z.string().optional().describe("State/province where the business is located"),
  phone: z.string().optional().describe("Contact phone number"),
  email: z.string().optional().describe("Contact email address"),
  website: z.string().optional().describe("Main website URL"),
  socialLinks: socialLinksSchema.optional().describe("Social media profiles"),
  description: z.string().optional().describe("General description or tagline of the business"),
  cuisine: z.string().optional().describe("Type of cuisine or food (for restaurants)"),
  priceRange: z.string().optional().describe("Price range indicator ($ to $$$$, or description)"),
  hours: z.string().optional().describe("Business hours if mentioned"),
});

export const businessInfoPrompt = `
Extract business information from this page.

Look for:
1. Business/restaurant name
2. Owner or founder name and their title
3. The founding story or "about us" narrative - how and why they started
4. Year founded or opened
5. Location and contact details (address, phone, email)
6. Social media links (Instagram, Facebook, Twitter, etc.)
7. Type of cuisine or business description
8. Price range if mentioned
9. Operating hours

Focus on the "About" section, "Our Story", or similar pages.
If you can't find certain information, leave those fields empty.
`.trim();

export default {
  schema: businessInfoSchema,
  prompt: businessInfoPrompt,
  name: "business-info",
  description: "Extract owner name, founding story, contact info, and social links",
};
