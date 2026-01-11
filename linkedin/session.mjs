/**
 * LinkedIn Session Manager
 *
 * Handles:
 *   - LinkedIn authentication with email/password
 *   - Cookie persistence for session reuse
 *   - Verification challenge handling (email codes, CAPTCHA)
 *   - Rate limiting and detection avoidance
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";

// Import email helper for verification codes
const HOME = process.env.HOME;
let getVerificationCode;
try {
  const emailHelper = await import(`${HOME}/Desktop/tooling/browsing/stagehand/lib/email-helper.mjs`);
  getVerificationCode = emailHelper.getVerificationCode;
} catch (e) {
  console.log("[LinkedIn] Email helper not available, manual verification will be required");
  getVerificationCode = null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Prompt for manual input
async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Configuration
const CONFIG_DIR = path.join(os.homedir(), '.config', 'linkedin');
const COOKIES_PATH = path.join(CONFIG_DIR, 'cookies.json');
const SESSION_PATH = path.join(CONFIG_DIR, 'session.json');

// LinkedIn URLs
const LINKEDIN_URLS = {
  base: "https://www.linkedin.com",
  login: "https://www.linkedin.com/login",
  feed: "https://www.linkedin.com/feed/",
  search: "https://www.linkedin.com/search/results/people/",
  myProfile: "https://www.linkedin.com/in/me/",
};

// Rate limiting configuration
const RATE_LIMITS = {
  search: { perHour: 30, delayMs: 3000 },
  profileView: { perHour: 100, delayMs: 2000 },
  connect: { perDay: 25, delayMs: 5000 },
  message: { perDay: 50, delayMs: 3000 },
};

/**
 * LinkedIn Session class
 * Manages browser session, authentication, and rate limiting
 */
export class LinkedInSession {
  constructor(options = {}) {
    this.stagehand = null;
    this.page = null;
    this.context = null;
    this.isLoggedIn = false;
    this.profile = null;
    this.headless = options.headless ?? false;
    this.verbose = options.verbose ?? 1;

    // Rate limiting state
    this.actionCounts = {
      search: { count: 0, resetAt: Date.now() + 3600000 },
      profileView: { count: 0, resetAt: Date.now() + 3600000 },
      connect: { count: 0, resetAt: Date.now() + 86400000 },
      message: { count: 0, resetAt: Date.now() + 86400000 },
    };

    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /**
   * Initialize the browser session
   */
  async init() {
    console.log("[LinkedIn] Initializing browser...");

    this.stagehand = new Stagehand({
      env: "LOCAL",
      verbose: this.verbose,
      localBrowserLaunchOptions: {
        headless: this.headless,
      },
    });

    await this.stagehand.init();
    this.context = this.stagehand.context;
    this.page = this.context.pages()[0];
    this.page.setDefaultTimeout(60000);

    // Load saved cookies
    const cookiesLoaded = await this._loadCookies();

    if (cookiesLoaded) {
      // Check if session is still valid
      const valid = await this.checkSessionValid();
      if (valid) {
        console.log("[LinkedIn] Session restored from cookies");
        this.isLoggedIn = true;
        return true;
      }
    }

    console.log("[LinkedIn] Browser ready (not logged in)");
    return false;
  }

  /**
   * Close the browser session
   */
  async close() {
    // Save cookies before closing
    await this._saveCookies();
    await this._saveSessionState();

    if (this.stagehand) {
      await this.stagehand.close();
    }
  }

  // ==================== COOKIE PERSISTENCE ====================

  async _saveCookies() {
    try {
      const cookies = await this.context.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      console.log(`[LinkedIn] Saved ${cookies.length} cookies`);
    } catch (e) {
      console.log(`[LinkedIn] Could not save cookies: ${e.message}`);
    }
  }

  async _loadCookies() {
    try {
      if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));

        // Filter out expired cookies
        const now = Date.now() / 1000;
        const validCookies = cookies.filter(c => !c.expires || c.expires > now);

        if (validCookies.length > 0) {
          await this.context.addCookies(validCookies);
          console.log(`[LinkedIn] Loaded ${validCookies.length} saved cookies`);
          return true;
        }
      }
    } catch (e) {
      console.log(`[LinkedIn] Could not load cookies: ${e.message}`);
    }
    return false;
  }

  async clearCookies() {
    try {
      if (fs.existsSync(COOKIES_PATH)) {
        fs.unlinkSync(COOKIES_PATH);
        console.log("[LinkedIn] Cleared saved cookies");
      }
      await this.context.clearCookies();
      this.isLoggedIn = false;
    } catch (e) {
      console.log(`[LinkedIn] Could not clear cookies: ${e.message}`);
    }
  }

  async _saveSessionState() {
    try {
      const state = {
        isLoggedIn: this.isLoggedIn,
        profile: this.profile,
        lastActivity: new Date().toISOString(),
        actionCounts: this.actionCounts,
      };
      fs.writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      // Ignore
    }
  }

  // ==================== AUTHENTICATION ====================

  /**
   * Check if the current session is valid
   */
  async checkSessionValid() {
    try {
      await this.page.goto(LINKEDIN_URLS.feed, { waitUntil: 'domcontentloaded' });
      await sleep(3000);

      const url = this.page.url();

      // If we're not redirected to login, session is valid
      if (!url.includes('/login') && !url.includes('/authwall') && !url.includes('/checkpoint')) {
        // Try to extract current user info
        try {
          const profileData = await this.stagehand.extract({
            instruction: "Extract the current logged-in user's name from the navigation or profile area",
            schema: z.object({
              name: z.string().optional(),
            }),
          });
          if (profileData?.name) {
            this.profile = { name: profileData.name };
            console.log(`[LinkedIn] Logged in as: ${profileData.name}`);
          }
        } catch (e) {
          // Couldn't extract name, but still logged in
        }
        return true;
      }

      return false;
    } catch (e) {
      console.log(`[LinkedIn] Session check failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Log into LinkedIn
   */
  async login(forceLogin = false) {
    if (this.isLoggedIn && !forceLogin) {
      console.log("[LinkedIn] Already logged in");
      return true;
    }

    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;

    if (!email) {
      console.error("[LinkedIn] Set LINKEDIN_EMAIL environment variable");
      return false;
    }

    console.log(`[LinkedIn] Logging in as ${email}...`);

    await this.page.goto(LINKEDIN_URLS.login);
    await sleep(2000);

    try {
      // Check for any existing verification/challenge pages
      await this._handleChallengesIfPresent();

      // Enter email
      console.log("[LinkedIn] Entering email...");
      await this.stagehand.act(`type "${email}" into the email or username field`);
      await sleep(500);

      // Enter password if available
      if (password) {
        console.log("[LinkedIn] Entering password...");
        await this.stagehand.act(`type "${password}" into the password field`);
        await sleep(500);
      }

      // Click sign in
      await this.stagehand.act("click the Sign In button");
      await sleep(4000);

      // Handle any verification challenges
      await this._handleChallengesIfPresent();

      // Check if login succeeded
      await sleep(3000);
      const currentUrl = this.page.url();
      this.isLoggedIn = !currentUrl.includes('/login') &&
                         !currentUrl.includes('/authwall') &&
                         !currentUrl.includes('/checkpoint');

      if (this.isLoggedIn) {
        console.log("[LinkedIn] Login successful");
        await this._saveCookies();
      } else {
        console.log("[LinkedIn] Login may have failed - check browser");
      }

      return this.isLoggedIn;

    } catch (error) {
      console.error(`[LinkedIn] Login error: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle various verification challenges
   */
  async _handleChallengesIfPresent() {
    const pageContent = await this.page.content();
    const pageUrl = this.page.url();

    // Check for different challenge types
    if (pageUrl.includes('/checkpoint') || pageContent.includes('verification')) {
      console.log("[LinkedIn] Verification challenge detected");
      await this._handleVerificationChallenge(pageContent);
    } else if (pageContent.toLowerCase().includes('captcha') ||
               pageContent.toLowerCase().includes('robot') ||
               pageContent.toLowerCase().includes('security check')) {
      console.log("[LinkedIn] CAPTCHA/Security check detected");
      await this._handleCaptcha();
    } else if (pageContent.includes('unusual activity') || pageContent.includes('security verification')) {
      console.log("[LinkedIn] Unusual activity check detected");
      await this._handleSecurityCheck();
    }
  }

  /**
   * Handle email/phone verification
   */
  async _handleVerificationChallenge(pageContent) {
    // Try to select email verification if options are shown
    try {
      if (pageContent.includes('email') && pageContent.includes('text')) {
        await this.stagehand.act("select the email verification option");
        await sleep(2000);
      }

      // Click to send verification code
      await this.stagehand.act("click to send or request the verification code");
      await sleep(5000);

      // Get verification code
      const code = await this._getVerificationCode();

      if (code) {
        console.log(`[LinkedIn] Entering verification code: ${code}`);
        await this.stagehand.act(`type "${code}" into the verification code input`);
        await sleep(1000);
        await this.stagehand.act("click Submit or Verify button");
        await sleep(3000);
      } else {
        console.log("[LinkedIn] Could not get verification code - manual intervention required");
        await this._waitForManualIntervention(60);
      }
    } catch (e) {
      console.log(`[LinkedIn] Verification handling error: ${e.message}`);
      await this._waitForManualIntervention(60);
    }
  }

  /**
   * Get verification code from email
   */
  async _getVerificationCode() {
    if (getVerificationCode) {
      console.log("[LinkedIn] Checking email for verification code...");
      const code = await getVerificationCode({
        waitMs: 15000,
        retries: 4,
        keywords: ["linkedin", "verification", "code", "security"],
        codePattern: /\b(\d{6})\b/,
      });
      return code;
    }

    // Manual fallback
    if (process.stdin.isTTY) {
      return await prompt("Enter verification code from email: ");
    }

    return null;
  }

  /**
   * Handle CAPTCHA challenges
   */
  async _handleCaptcha() {
    console.log("[LinkedIn] CAPTCHA detected - waiting for manual completion...");
    await this._waitForManualIntervention(120); // 2 minutes
  }

  /**
   * Handle security verification
   */
  async _handleSecurityCheck() {
    console.log("[LinkedIn] Security check detected - attempting to complete...");

    try {
      // Try to click any "Verify" or "Continue" button
      await this.stagehand.act("click Verify or Continue button");
      await sleep(3000);

      // Check if we need email verification
      const pageContent = await this.page.content();
      if (pageContent.includes('code') || pageContent.includes('verification')) {
        await this._handleVerificationChallenge(pageContent);
      }
    } catch (e) {
      await this._waitForManualIntervention(60);
    }
  }

  /**
   * Wait for manual intervention
   */
  async _waitForManualIntervention(timeoutSeconds) {
    console.log(`[LinkedIn] Waiting up to ${timeoutSeconds}s for manual intervention...`);
    console.log("[LinkedIn] Please complete the verification in the browser window.");

    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (Date.now() - startTime < timeoutMs) {
      await sleep(5000);

      const url = this.page.url();
      if (!url.includes('/checkpoint') &&
          !url.includes('/login') &&
          !url.includes('/authwall') &&
          url.includes('linkedin.com')) {
        console.log("[LinkedIn] Manual intervention completed");
        return true;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[LinkedIn] Still waiting... (${elapsed}s)`);
    }

    console.log("[LinkedIn] Timeout waiting for manual intervention");
    return false;
  }

  // ==================== RATE LIMITING ====================

  /**
   * Apply rate limiting delay for an action
   */
  async throttle(action) {
    const limit = RATE_LIMITS[action];
    if (!limit) return;

    const counter = this.actionCounts[action];
    const now = Date.now();

    // Reset counter if time window has passed
    if (now > counter.resetAt) {
      counter.count = 0;
      counter.resetAt = now + (action === 'connect' || action === 'message' ? 86400000 : 3600000);
    }

    // Check if we've hit the limit
    const maxCount = action === 'connect' ? limit.perDay :
                     action === 'message' ? limit.perDay : limit.perHour;

    if (counter.count >= maxCount) {
      const waitTime = counter.resetAt - now;
      console.log(`[LinkedIn] Rate limit reached for ${action}. Reset in ${Math.round(waitTime / 60000)} minutes.`);
      throw new Error(`Rate limit reached for ${action}`);
    }

    // Increment counter
    counter.count++;

    // Add delay with random jitter
    const delay = limit.delayMs + Math.random() * 2000;
    console.log(`[LinkedIn] Waiting ${Math.round(delay / 1000)}s before ${action}...`);
    await sleep(delay);
  }

  // ==================== NAVIGATION HELPERS ====================

  /**
   * Navigate to a LinkedIn page with rate limiting
   */
  async navigateTo(url, action = null) {
    if (action) {
      await this.throttle(action);
    }

    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // Random scroll to appear more human-like
    await this._humanScroll();
  }

  /**
   * Simulate human-like scrolling
   */
  async _humanScroll() {
    const scrollAmount = 100 + Math.random() * 300;
    await this.page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);
    await sleep(500 + Math.random() * 500);
  }

  /**
   * Ensure logged in before performing action
   */
  async ensureLoggedIn() {
    if (!this.isLoggedIn) {
      const loggedIn = await this.login();
      if (!loggedIn) {
        throw new Error("Not logged in and login failed");
      }
    }
    return true;
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      isLoggedIn: this.isLoggedIn,
      profile: this.profile,
      lastActivity: new Date().toISOString(),
      rateLimits: Object.fromEntries(
        Object.entries(this.actionCounts).map(([action, counter]) => [
          action,
          {
            remaining: (RATE_LIMITS[action]?.perHour || RATE_LIMITS[action]?.perDay || 0) - counter.count,
            resetsAt: new Date(counter.resetAt).toISOString(),
          }
        ])
      ),
    };
  }
}

// Singleton instance for reuse across API calls
let sessionInstance = null;

/**
 * Get or create a LinkedIn session
 */
export async function getSession(options = {}) {
  if (!sessionInstance) {
    sessionInstance = new LinkedInSession(options);
    await sessionInstance.init();
  }
  return sessionInstance;
}

/**
 * Close the current session
 */
export async function closeSession() {
  if (sessionInstance) {
    await sessionInstance.close();
    sessionInstance = null;
  }
}

export default LinkedInSession;
