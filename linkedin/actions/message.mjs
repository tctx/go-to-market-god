/**
 * LinkedIn Message Actions
 *
 * Send messages with optional AI enhancement using HubSpot context
 */

import { z } from "zod";
import { navigateToProfile, extractProfile } from "./profile.mjs";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send a message to a connection
 *
 * @param {LinkedInSession} session - Active LinkedIn session
 * @param {Object} options - Message options
 * @param {string} options.profileUrl - Profile URL to message
 * @param {string} options.profileId - Profile ID (alternative to URL)
 * @param {string} options.personName - Person's name (for search)
 * @param {string} options.companyName - Company name (for search)
 * @param {string} options.message - Message to send
 * @param {boolean} options.useAI - Enhance message with AI
 * @param {Object} options.hubspotContext - HubSpot data for AI personalization
 * @param {Object} options.profile - Pre-fetched profile data for AI
 * @returns {Promise<Object>} Message result
 */
export async function sendMessage(session, options = {}) {
  const {
    profileUrl,
    profileId,
    personName,
    companyName,
    message,
    useAI = false,
    hubspotContext,
    profile,
  } = options;

  if (!message && !useAI) {
    return {
      ok: false,
      error: "Message is required",
    };
  }

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

  // Rate limit for messages
  await session.throttle('message');

  console.log(`[LinkedIn] Preparing to send message...`);

  // Check if we can message this person
  const pageContent = await session.page.content();

  if (!pageContent.includes('Message') ||
      (pageContent.includes('Connect') && !pageContent.includes('1st'))) {
    console.log("[LinkedIn] Cannot message this person - not connected");
    return {
      ok: false,
      status: "not_connected",
      error: "Can only message connections. Send a connection request first.",
    };
  }

  // Generate or enhance message with AI if requested
  let finalMessage = message;
  if (useAI) {
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

      finalMessage = await generatePersonalizedMessage(message, profileData, hubspotContext);
      console.log(`[LinkedIn] Enhanced message with AI`);
    } catch (e) {
      console.log(`[LinkedIn] AI enhancement failed, using original message: ${e.message}`);
    }
  }

  try {
    // Click Message button
    await session.stagehand.act("click the Message button");
    await sleep(2000);

    // Type the message in the message compose box
    await session.stagehand.act(`type "${finalMessage.replace(/"/g, "'").replace(/\n/g, ' ')}" into the message text area or compose box`);
    await sleep(1000);

    // Send the message
    await session.stagehand.act("click the Send button");
    await sleep(2000);

    console.log("[LinkedIn] Message sent successfully");

    return {
      ok: true,
      status: "sent",
      message: finalMessage,
    };

  } catch (error) {
    console.error(`[LinkedIn] Message error: ${error.message}`);

    return {
      ok: false,
      status: "failed",
      error: error.message,
    };
  }
}

/**
 * Generate a personalized message using AI and context
 *
 * @param {string} template - Base message or template
 * @param {Object} profile - LinkedIn profile data
 * @param {Object} hubspotContext - HubSpot context data
 * @returns {Promise<string>} Personalized message
 */
export async function generatePersonalizedMessage(template, profile, hubspotContext = {}) {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are a professional B2B outreach specialist helping personalize LinkedIn messages.

Your job is to take a message template and personalize it for the recipient based on their profile and any additional context provided.

Rules:
- Keep the core message intent and any specific offers/asks from the template
- Add personalization that references the recipient's background
- Keep it professional but conversational
- Avoid generic phrases like "I noticed your profile" or "I came across your work"
- Be specific when referencing their experience
- Keep messages concise (under 300 words for initial outreach)
- NO emojis unless the template has them
- Match the tone of the original template`;

  const userPrompt = `Personalize this LinkedIn message:

TEMPLATE/MESSAGE:
${template || "Hi, I'd love to connect and discuss how we might work together."}

RECIPIENT PROFILE:
- Name: ${profile.name}
- Title: ${profile.headline || profile.currentTitle || 'Not specified'}
- Company: ${profile.currentCompany || 'Not specified'}
- About: ${(profile.about || '').slice(0, 500)}
${profile.experience?.length ? `- Recent Experience: ${profile.experience.slice(0, 2).map(e => `${e.title} at ${e.company}`).join(', ')}` : ''}
${profile.skills?.length ? `- Skills: ${profile.skills.slice(0, 5).join(', ')}` : ''}

${Object.keys(hubspotContext).length > 0 ? `ADDITIONAL CONTEXT FROM CRM:
- Company: ${hubspotContext.companyName || hubspotContext.company?.name || 'N/A'}
- Industry: ${hubspotContext.industry || hubspotContext.company?.industry || 'N/A'}
- Previous Interactions: ${hubspotContext.interactions || 'None'}
- Notes: ${hubspotContext.notes || 'None'}
- Our Value Prop for Them: ${hubspotContext.valueProp || 'N/A'}` : ''}

Generate the personalized message. Start directly with the message (no "Subject:" or labels):`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  } catch (e) {
    console.error(`[LinkedIn] AI message generation failed: ${e.message}`);
    // Return original template if AI fails
    return template || `Hi ${profile.name?.split(' ')[0] || 'there'}, I'd love to connect and discuss potential opportunities.`;
  }
}

/**
 * Preview a personalized message without sending
 */
export async function previewMessage(session, options = {}) {
  const {
    profileUrl,
    profileId,
    personName,
    companyName,
    template,
    hubspotContext,
  } = options;

  await session.ensureLoggedIn();

  // Get profile data
  let profile;
  if (profileUrl || profileId || personName) {
    const extraction = await extractProfile(session, profileUrl || null);
    if (extraction.ok) {
      profile = extraction.profile;
    } else {
      return {
        ok: false,
        error: extraction.error,
      };
    }
  }

  if (!profile) {
    return {
      ok: false,
      error: "Could not get profile data",
    };
  }

  // Generate personalized message
  try {
    const personalizedMessage = await generatePersonalizedMessage(template, profile, hubspotContext);

    return {
      ok: true,
      profile: {
        name: profile.name,
        headline: profile.headline,
        currentCompany: profile.currentCompany,
      },
      originalTemplate: template,
      personalizedMessage,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

/**
 * Send a follow-up message
 */
export async function sendFollowUp(session, options = {}) {
  const {
    profileUrl,
    profileId,
    personName,
    companyName,
    previousMessage,
    followUpTemplate,
    daysSinceLast,
    hubspotContext,
  } = options;

  // Generate follow-up specific template
  const template = followUpTemplate || `Hi again! I wanted to follow up on my previous message. ${previousMessage ? 'I mentioned ' + previousMessage.slice(0, 50) + '...' : ''} Would love to connect if you have a moment.`;

  return sendMessage(session, {
    profileUrl,
    profileId,
    personName,
    companyName,
    message: template,
    useAI: true,
    hubspotContext: {
      ...hubspotContext,
      isFollowUp: true,
      daysSinceLast,
      previousMessage,
    },
  });
}

/**
 * Batch send messages to multiple connections
 */
export async function batchMessage(session, profiles, options = {}) {
  const { template, useAI = true, hubspotContext, delayBetween = 15000 } = options;

  const results = {
    sent: [],
    failed: [],
  };

  for (const profile of profiles) {
    try {
      const result = await sendMessage(session, {
        profileUrl: profile.profileUrl,
        personName: profile.name,
        companyName: profile.currentCompany,
        message: template,
        useAI,
        hubspotContext,
        profile,
      });

      if (result.ok) {
        results.sent.push({ ...profile, result });
      } else {
        results.failed.push({ ...profile, result });

        // Stop if we can't message
        if (result.status === 'not_connected') {
          // This person needs connection first, but continue with others
          continue;
        }
      }

      // Delay between messages
      console.log(`[LinkedIn] Waiting ${delayBetween / 1000}s before next...`);
      await sleep(delayBetween);

    } catch (error) {
      results.failed.push({ ...profile, error: error.message });
    }
  }

  console.log(`[LinkedIn] Batch complete: ${results.sent.length} sent, ${results.failed.length} failed`);

  return {
    ok: true,
    ...results,
  };
}

export default {
  sendMessage,
  generatePersonalizedMessage,
  previewMessage,
  sendFollowUp,
  batchMessage,
};
