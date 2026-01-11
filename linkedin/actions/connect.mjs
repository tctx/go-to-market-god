/**
 * LinkedIn Connect Actions
 *
 * Send connection requests with optional personalized notes
 */

import { z } from "zod";
import { navigateToProfile, getConnectionStatus } from "./profile.mjs";
import { generatePersonalizedMessage } from "./message.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send a connection request
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {Object} options - Connection options
 * @param {string} options.profileUrl - Profile URL to connect with
 * @param {string} options.profileId - Profile ID (alternative to URL)
 * @param {string} options.personName - Person's name (for search)
 * @param {string} options.companyName - Company name (for search)
 * @param {string} options.note - Connection note (max 300 chars)
 * @param {boolean} options.useAI - Generate AI-personalized note
 * @param {Object} options.hubspotContext - HubSpot data for AI personalization
 * @param {Object} options.profile - Pre-fetched profile data for AI
 * @returns {Promise<Object>} Connection result
 */
export async function sendConnectionRequest(session, options = {}) {
  const {
    profileUrl,
    profileId,
    personName,
    companyName,
    note,
    useAI = false,
    hubspotContext,
    profile,
  } = options;

  await session.ensureLoggedIn();

  // Navigate to profile
  const navResult = await navigateToProfile(session, {
    profileUrl,
    profileId,
    personName,
    companyName,
  });

  if (!navResult.ok) {
    return navResult;
  }

  // Rate limit for connection requests
  await session.throttle('connect');

  console.log(`[LinkedIn] Sending connection request...`);

  // Check current connection status
  const pageContent = await session.page.content();

  // Already connected?
  if (pageContent.toLowerCase().includes('1st degree') ||
      pageContent.includes('Message') && !pageContent.includes('Connect')) {
    console.log("[LinkedIn] Already connected with this person");
    return {
      ok: true,
      status: "already_connected",
      message: "Already connected with this person",
    };
  }

  // Pending connection?
  if (pageContent.toLowerCase().includes('pending') ||
      pageContent.includes('Withdraw')) {
    console.log("[LinkedIn] Connection request already pending");
    return {
      ok: true,
      status: "pending",
      message: "Connection request already pending",
    };
  }

  // Generate personalized note if requested
  let connectionNote = note;
  if (useAI && !note) {
    try {
      // Get profile data if not provided
      let profileData = profile;
      if (!profileData) {
        const extraction = await session.stagehand.extract({
          instruction: "Extract the person's name, headline, current company, and about section",
          schema: z.object({
            name: z.string(),
            headline: z.string().optional(),
            currentCompany: z.string().optional(),
            about: z.string().optional(),
          }),
        });
        profileData = extraction;
      }

      connectionNote = await generatePersonalizedNote(profileData, hubspotContext);
      console.log(`[LinkedIn] Generated AI note: ${connectionNote.slice(0, 50)}...`);
    } catch (e) {
      console.log(`[LinkedIn] Could not generate AI note: ${e.message}`);
    }
  }

  try {
    // Click Connect button
    await session.stagehand.act("click the Connect button");
    await sleep(2000);

    // Handle the connection modal
    const modalContent = await session.page.content();

    // Check if we need to select "Add a note"
    if (connectionNote && modalContent.includes('Add a note')) {
      await session.stagehand.act("click 'Add a note' button");
      await sleep(1000);

      // Type the note (max 300 characters)
      const truncatedNote = connectionNote.slice(0, 300);
      await session.stagehand.act(`type "${truncatedNote.replace(/"/g, "'")}" into the note text area`);
      await sleep(500);
    }

    // Send the connection request
    await session.stagehand.act("click 'Send' or 'Send invitation' button");
    await sleep(2000);

    console.log("[LinkedIn] Connection request sent");

    return {
      ok: true,
      status: "sent",
      message: "Connection request sent successfully",
      note: connectionNote,
    };

  } catch (error) {
    console.error(`[LinkedIn] Connection error: ${error.message}`);

    // Check if it's a weekly limit error
    if (error.message.toLowerCase().includes('limit') ||
        error.message.toLowerCase().includes('weekly')) {
      return {
        ok: false,
        status: "limit_reached",
        error: "Weekly connection limit reached",
      };
    }

    // Check if "Connect" button not found - might need to use "More" menu
    try {
      await session.stagehand.act("click the More button");
      await sleep(1000);
      await session.stagehand.act("click Connect from the dropdown menu");
      await sleep(2000);

      if (connectionNote) {
        await session.stagehand.act("click 'Add a note' button");
        await sleep(1000);
        await session.stagehand.act(`type "${connectionNote.slice(0, 300).replace(/"/g, "'")}" into the note text area`);
        await sleep(500);
      }

      await session.stagehand.act("click 'Send' button");
      await sleep(2000);

      return {
        ok: true,
        status: "sent",
        message: "Connection request sent (via More menu)",
        note: connectionNote,
      };
    } catch (e) {
      return {
        ok: false,
        status: "failed",
        error: error.message,
      };
    }
  }
}

/**
 * Generate a personalized connection note using AI
 */
async function generatePersonalizedNote(profile, hubspotContext) {
  // Use OpenAI if available
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are a professional B2B networking specialist. Generate a brief LinkedIn connection note (under 300 characters).

Rules:
- Be professional but warm
- Reference something specific about their background
- Keep it genuine and not salesy
- End with a simple reason for connecting
- NO emojis
- Under 300 characters total`;

  const userPrompt = `Generate a connection note for:

Name: ${profile.name}
Title: ${profile.headline || profile.currentTitle || 'Not specified'}
Company: ${profile.currentCompany || 'Not specified'}
About: ${(profile.about || '').slice(0, 200)}

${hubspotContext ? `Additional context:
- Industry: ${hubspotContext.industry || 'Unknown'}
- Company: ${hubspotContext.companyName || 'Unknown'}
- Notes: ${hubspotContext.notes || 'None'}` : ''}

Generate a brief, professional connection note:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    let note = response.choices[0].message.content.trim();

    // Remove quotes if present
    note = note.replace(/^["']|["']$/g, '');

    // Ensure under 300 chars
    if (note.length > 300) {
      note = note.slice(0, 297) + '...';
    }

    return note;
  } catch (e) {
    console.error(`[LinkedIn] AI note generation failed: ${e.message}`);
    // Return a simple default note
    return `Hi ${profile.name?.split(' ')[0] || 'there'}, I'd like to connect and learn more about your work.`;
  }
}

/**
 * Withdraw a pending connection request
 */
export async function withdrawConnection(session, options = {}) {
  const { profileUrl, profileId, personName, companyName } = options;

  await session.ensureLoggedIn();

  // Navigate to profile
  const navResult = await navigateToProfile(session, {
    profileUrl,
    profileId,
    personName,
    companyName,
  });

  if (!navResult.ok) {
    return navResult;
  }

  try {
    // Look for Pending/Withdraw button
    await session.stagehand.act("click 'Pending' or 'Withdraw' button");
    await sleep(2000);

    // Confirm withdrawal if prompted
    try {
      await session.stagehand.act("click 'Withdraw' to confirm");
      await sleep(1000);
    } catch (e) {
      // May not need confirmation
    }

    console.log("[LinkedIn] Connection request withdrawn");

    return {
      ok: true,
      status: "withdrawn",
      message: "Connection request withdrawn",
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error: error.message,
    };
  }
}

/**
 * Batch send connection requests
 */
export async function batchConnect(session, profiles, options = {}) {
  const { note, useAI = false, hubspotContext, delayBetween = 10000 } = options;

  const results = {
    sent: [],
    failed: [],
    skipped: [],
  };

  for (const profile of profiles) {
    try {
      const result = await sendConnectionRequest(session, {
        profileUrl: profile.profileUrl,
        personName: profile.name,
        companyName: profile.currentCompany,
        note,
        useAI,
        hubspotContext,
        profile,
      });

      if (result.ok) {
        if (result.status === 'sent') {
          results.sent.push({ ...profile, result });
        } else {
          results.skipped.push({ ...profile, result });
        }
      } else {
        results.failed.push({ ...profile, result });

        // Stop if we hit rate limits
        if (result.status === 'limit_reached') {
          console.log("[LinkedIn] Rate limit reached, stopping batch");
          break;
        }
      }

      // Delay between requests
      console.log(`[LinkedIn] Waiting ${delayBetween / 1000}s before next...`);
      await sleep(delayBetween);

    } catch (error) {
      results.failed.push({ ...profile, error: error.message });
    }
  }

  console.log(`[LinkedIn] Batch complete: ${results.sent.length} sent, ${results.skipped.length} skipped, ${results.failed.length} failed`);

  return {
    ok: true,
    ...results,
  };
}

export default {
  sendConnectionRequest,
  withdrawConnection,
  batchConnect,
};
