#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const db = require("./db");

const PROJECT_ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");

const loadEnv = () => {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").trim();
    }
  });
};

loadEnv();

const HUBSPOT_BASE_URL = (process.env.HUBSPOT_BASE_URL || "https://api.hubapi.com").replace(/\/$/, "");
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID || "";
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || "";
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI || "";
const TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 45000);
const PORT_RANGE = { min: 36000, max: 39999 };

const ACTIVE_SCRIPT_PATH = path.join(PROJECT_ROOT, "add-to-hubspot.js");

const DEFAULT_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
  "crm.schemas.companies.read",
  "crm.schemas.companies.write",
];

const parseScopes = (value) => {
  if (!value) return DEFAULT_SCOPES;
  const cleaned = value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : DEFAULT_SCOPES;
};

const OAUTH_SCOPES = parseScopes(process.env.HUBSPOT_OAUTH_SCOPES);

const STATIC_FILES = {
  "/": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
};

const pendingStates = new Map();

const CONTACT_PROPERTIES = [
  {
    name: "sf_lead_score",
    label: "SF Lead Score",
    description: "Synthetic Friends lead score (0-100).",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_lead_source",
    label: "SF Lead Source",
    description: "Source of this lead (manual, apollo, clearbit, referral, event).",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Manual", value: "manual" },
      { label: "Apollo", value: "apollo" },
      { label: "Clearbit", value: "clearbit" },
      { label: "Referral", value: "referral" },
      { label: "Event", value: "event" },
      { label: "Inbound", value: "inbound" },
      { label: "Other", value: "other" },
    ],
  },
  {
    name: "sf_engagement_level",
    label: "SF Engagement Level",
    description: "Engagement or intent bucket from outreach signals.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Cold", value: "cold" },
      { label: "Warm", value: "warm" },
      { label: "Hot", value: "hot" },
    ],
  },
  {
    name: "sf_lifecycle_stage",
    label: "SF Lifecycle Stage",
    description: "Synthetic Friends pipeline stage (custom).",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Targeted", value: "targeted" },
      { label: "Contact Identified", value: "contact_identified" },
      { label: "Enriched", value: "enriched" },
      { label: "Emailed", value: "emailed" },
      { label: "Replied", value: "replied" },
      { label: "Call Booked", value: "call_booked" },
      { label: "Pilot Proposed", value: "pilot_proposed" },
      { label: "Pilot Live", value: "pilot_live" },
      { label: "Closed Won", value: "closed_won" },
      { label: "Closed Lost", value: "closed_lost" },
    ],
  },
  {
    name: "sf_industry_vertical",
    label: "SF Industry Vertical",
    description: "Vertical for targeting or messaging.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Restaurants", value: "restaurants" },
      { label: "Hospitality", value: "hospitality" },
      { label: "Retail", value: "retail" },
      { label: "Fitness", value: "fitness" },
      { label: "Healthcare", value: "healthcare" },
      { label: "Services", value: "services" },
      { label: "Other", value: "other" },
    ],
  },
  {
    name: "sf_preferred_channel",
    label: "SF Preferred Channel",
    description: "Best outreach channel for this contact.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Email", value: "email" },
      { label: "SMS/iMessage", value: "sms_imessage" },
      { label: "Phone Call", value: "phone" },
      { label: "LinkedIn", value: "linkedin" },
      { label: "Other", value: "other" },
    ],
  },
  {
    name: "sf_seen_demo",
    label: "SF Seen Demo",
    description: "Has this contact seen the Synthetic Friends demo?",
    groupName: "contactinformation",
    type: "bool",
    fieldType: "booleancheckbox",
  },
  {
    name: "sf_deal_probability",
    label: "SF Deal Probability",
    description: "Estimated probability to close (0-100).",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_role_fit_score",
    label: "SF Role Fit Score",
    description: "Role fit score (0-100) from the enrichment pipeline.",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_email_verification",
    label: "SF Email Verification",
    description: "Email verification status.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Deliverable", value: "deliverable" },
      { label: "Undeliverable", value: "undeliverable" },
      { label: "Risky", value: "risky" },
      { label: "Unknown", value: "unknown" },
    ],
  },
  {
    name: "sf_confidence",
    label: "SF Confidence",
    description: "Overall confidence score (0-100).",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_source",
    label: "SF Source",
    description: "Source system for the contact.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Apollo", value: "apollo" },
      { label: "Clearbit", value: "clearbit" },
      { label: "Manual", value: "manual" },
      { label: "Other", value: "other" },
    ],
  },
  {
    name: "sf_email_sent_count",
    label: "SF Email Sent Count",
    description: "Number of tracked outbound emails sent to this contact.",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_email_received_count",
    label: "SF Email Received Count",
    description: "Number of tracked inbound emails received from this contact.",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_email_open_count",
    label: "SF Email Open Count",
    description: "Total tracked opens for this contact.",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_email_click_count",
    label: "SF Email Click Count",
    description: "Total tracked clicks for this contact.",
    groupName: "contactinformation",
    type: "number",
    fieldType: "number",
  },
  {
    name: "sf_email_first_tracked_at",
    label: "SF Email First Tracked At",
    description: "First time this contact was tracked via email.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_activity_at",
    label: "SF Email Last Activity At",
    description: "Most recent tracked email activity timestamp.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_sent_at",
    label: "SF Email Last Sent At",
    description: "Most recent outbound email to this contact.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_received_at",
    label: "SF Email Last Received At",
    description: "Most recent inbound email from this contact.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_opened_at",
    label: "SF Email Last Opened At",
    description: "Most recent tracked email open.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_clicked_at",
    label: "SF Email Last Clicked At",
    description: "Most recent tracked email click.",
    groupName: "contactinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_email_last_subject",
    label: "SF Email Last Subject",
    description: "Subject line of the last tracked email event.",
    groupName: "contactinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_email_last_thread_id",
    label: "SF Email Last Thread ID",
    description: "Latest tracked email thread ID (Gmail).",
    groupName: "contactinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_email_last_message_id",
    label: "SF Email Last Message ID",
    description: "Latest tracked email message ID (Gmail).",
    groupName: "contactinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_email_last_event_type",
    label: "SF Email Last Event Type",
    description: "Last tracked email event type.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Sent", value: "sent" },
      { label: "Received", value: "received" },
      { label: "Open", value: "open" },
      { label: "Click", value: "click" },
    ],
  },
  {
    name: "sf_email_last_direction",
    label: "SF Email Last Direction",
    description: "Direction of the last tracked email event.",
    groupName: "contactinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Outbound", value: "outbound" },
      { label: "Inbound", value: "inbound" },
    ],
  },
];

const COMPANY_PROPERTIES = [
  {
    name: "sf_last_enriched_at",
    label: "SF Last Enriched At",
    description: "Last enrichment timestamp.",
    groupName: "companyinformation",
    type: "datetime",
    fieldType: "date",
  },
  {
    name: "sf_enrichment_status",
    label: "SF Enrichment Status",
    description: "Pipeline status.",
    groupName: "companyinformation",
    type: "enumeration",
    fieldType: "select",
    options: [
      { label: "Queued", value: "queued" },
      { label: "Running", value: "running" },
      { label: "Success", value: "success" },
      { label: "Error", value: "error" },
    ],
  },
  {
    name: "sf_enrichment_notes",
    label: "SF Enrichment Notes",
    description: "Pipeline notes and errors.",
    groupName: "companyinformation",
    type: "string",
    fieldType: "textarea",
  },
  {
    name: "sf_best_contact_email",
    label: "SF Best Contact Email",
    description: "Best contact email from enrichment.",
    groupName: "companyinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_best_contact_name",
    label: "SF Best Contact Name",
    description: "Best contact full name from enrichment.",
    groupName: "companyinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_best_contact_role",
    label: "SF Best Contact Role",
    description: "Best contact role from enrichment.",
    groupName: "companyinformation",
    type: "string",
    fieldType: "text",
  },
  {
    name: "sf_best_contact_score",
    label: "SF Best Contact Score",
    description: "Best contact confidence score (0-100).",
    groupName: "companyinformation",
    type: "number",
    fieldType: "number",
  },
];

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) reject(new Error("Request too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const send = (res, statusCode, headers, body) => {
  res.writeHead(statusCode, headers);
  res.end(body);
};

const sendJson = (res, statusCode, payload) => {
  send(res, statusCode, { "Content-Type": "application/json" }, JSON.stringify(payload));
};

const sendHtml = (res, statusCode, body) => {
  send(res, statusCode, { "Content-Type": "text/html; charset=utf-8" }, body);
};

const contentTypeFor = (filePath) => {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
};

const serveStatic = (req, res) => {
  const fileName = STATIC_FILES[req.url];
  if (!fileName) return false;
  const filePath = path.join(__dirname, fileName);
  try {
    const body = fs.readFileSync(filePath);
    send(res, 200, { "Content-Type": contentTypeFor(filePath) }, body);
    return true;
  } catch (error) {
    sendJson(res, 500, { ok: false, error: `Failed to read ${fileName}: ${error.message}` });
    return true;
  }
};

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const baseUrlFor = (req) => {
  const host = req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
};

const redirectUriFor = (req) => {
  if (HUBSPOT_REDIRECT_URI) return HUBSPOT_REDIRECT_URI;
  return `${baseUrlFor(req)}/oauth/callback`;
};

const getToken = (payload) => (payload && typeof payload.token === "string" ? payload.token.trim() : "");

const hubspotRequest = async (token, method, pathName, body, params) => {
  const url = new URL(`${HUBSPOT_BASE_URL}${pathName}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = parseJson(text);
  if (!res.ok) {
    const message = text ? text.slice(0, 400) : res.statusText;
    const error = new Error(`HubSpot API ${res.status} ${res.statusText}: ${message}`);
    error.status = res.status;
    error.payload = json || text;
    throw error;
  }
  return json;
};

const listProperties = async (token, objectType) => {
  const payload = await hubspotRequest(token, "GET", `/crm/v3/properties/${objectType}`, null, { archived: "false" });
  return new Set((payload && payload.results ? payload.results : []).map((p) => p.name));
};

const createProperty = async (token, objectType, property) => {
  return hubspotRequest(token, "POST", `/crm/v3/properties/${objectType}`, property);
};

const ensureProperties = async (token, objectType, properties) => {
  const existing = await listProperties(token, objectType);
  const results = [];
  let created = 0;
  let exists = 0;
  let failed = 0;

  for (const property of properties) {
    if (existing.has(property.name)) {
      results.push({ name: property.name, status: "exists" });
      exists += 1;
      continue;
    }
    try {
      await createProperty(token, objectType, property);
      results.push({ name: property.name, status: "created" });
      created += 1;
    } catch (error) {
      if (error && error.status === 409) {
        results.push({ name: property.name, status: "exists" });
        exists += 1;
      } else {
        results.push({ name: property.name, status: "failed", error: error.message });
        failed += 1;
      }
    }
  }

  return { objectType, created, exists, failed, results };
};

const serializeArg = (arg) => {
  try {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    return JSON.stringify(arg, null, 2);
  } catch (_) {
    return String(arg);
  }
};

const replaceToken = (code, token) => {
  if (!token) return { source: code, replaced: false, injected: false };
  const declarationPattern = /\b(?:const|let|var)\s+HUBSPOT_TOKEN\s*=\s*[^;]*;/m;
  if (declarationPattern.test(code)) {
    return {
      source: code.replace(declarationPattern, `const HUBSPOT_TOKEN = '${token}';`),
      replaced: true,
      injected: false,
    };
  }
  return { source: `const HUBSPOT_TOKEN = '${token}';\n${code}`, replaced: false, injected: true };
};

async function runUserCode(source, token) {
  const logs = [];
  const consoleShim = {};

  ["log", "info", "warn", "error"].forEach((level) => {
    consoleShim[level] = (...args) => {
      const message = args.map(serializeArg).join(" ");
      logs.push({ level, message, ts: new Date().toISOString() });
    };
  });

  const sandbox = {
    console: consoleShim,
    fetch,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    Buffer,
    process: { env: { HUBSPOT_TOKEN: token || "" } },
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(source, { filename: "user-script.js" });
  const execution = (async () => {
    const result = script.runInContext(context);
    if (result && typeof result.then === "function") await result;
  })();

  let timeoutHandle;
  try {
    await Promise.race([
      execution,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      }),
    ]);
    return { ok: true, logs };
  } catch (error) {
    logs.push({ level: "error", message: serializeArg(error), ts: new Date().toISOString() });
    return { ok: false, logs, error: error.message || "Execution failed" };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

const pickRandomPort = () =>
  Math.floor(Math.random() * (PORT_RANGE.max - PORT_RANGE.min + 1)) + PORT_RANGE.min;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && serveStatic(req, res)) return;

  if (req.method === "GET" && req.url === "/api/health") {
    const dbAvailable = await db.isDatabaseAvailable();
    return sendJson(res, 200, { ok: true, database: dbAvailable });
  }

  // Database status endpoint
  if (req.method === "GET" && req.url === "/api/db/status") {
    const dbAvailable = await db.isDatabaseAvailable();
    return sendJson(res, 200, {
      ok: true,
      available: dbAvailable,
      configured: Boolean(process.env.DATABASE_URL),
      encrypted: Boolean(process.env.ENCRYPTION_KEY),
    });
  }

  if (req.method === "GET" && req.url === "/api/oauth/config") {
    return sendJson(res, 200, {
      redirectUri: redirectUriFor(req),
      hasClientId: Boolean(HUBSPOT_CLIENT_ID),
      hasClientSecret: Boolean(HUBSPOT_CLIENT_SECRET),
      scopes: OAUTH_SCOPES,
    });
  }

  if (req.method === "GET" && req.url === "/api/script/active") {
    try {
      const script = fs.readFileSync(ACTIVE_SCRIPT_PATH, "utf8");
      return send(res, 200, { "Content-Type": "text/plain; charset=utf-8" }, script);
    } catch (error) {
      return sendJson(res, 404, { ok: false, error: "add-to-hubspot.js not found" });
    }
  }

  if (req.method === "GET" && req.url.startsWith("/oauth/start")) {
    if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
      return sendHtml(
        res,
        400,
        "<h2>HubSpot OAuth not configured</h2><p>Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET.</p>"
      );
    }
    const redirectUri = redirectUriFor(req);
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    pendingStates.set(state, { redirectUri, createdAt: Date.now() });
    const authUrl = new URL("https://app.hubspot.com/oauth/authorize");
    authUrl.searchParams.set("client_id", HUBSPOT_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", OAUTH_SCOPES.join(" "));
    authUrl.searchParams.set("state", state);
    res.writeHead(302, { Location: authUrl.toString() });
    return res.end();
  }

  if (req.method === "GET" && req.url.startsWith("/oauth/callback")) {
    const url = new URL(req.url, baseUrlFor(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDesc = url.searchParams.get("error_description");

    if (error) {
      return sendHtml(
        res,
        400,
        `<h2>HubSpot OAuth Error</h2><p>${error}</p><pre>${errorDesc || ""}</pre>`
      );
    }

    if (!code || !state || !pendingStates.has(state)) {
      return sendHtml(res, 400, "<h2>Invalid OAuth response</h2><p>Missing or invalid state.</p>");
    }

    const { redirectUri } = pendingStates.get(state);
    pendingStates.delete(state);

    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      });
      const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await tokenRes.text();
      const json = parseJson(text) || {};
      if (!tokenRes.ok) {
        return sendHtml(
          res,
          400,
          `<h2>Token exchange failed</h2><pre>${text ? text.slice(0, 800) : tokenRes.statusText}</pre>`
        );
      }

      const payload = {
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_in: json.expires_in,
        token_type: json.token_type,
      };

      return sendHtml(
        res,
        200,
        `<script>
          (function() {
            const payload = ${JSON.stringify(payload)};
            if (window.opener) {
              window.opener.postMessage({ type: "hubspot_oauth", payload }, window.location.origin);
              window.close();
            } else {
              document.body.innerHTML = "<pre>" + JSON.stringify(payload, null, 2) + "</pre>";
            }
          })();
        </script>`
      );
    } catch (err) {
      return sendHtml(res, 500, `<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
    }
  }

  if (req.method === "POST" && req.url === "/api/hubspot/ping") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);
      const token = getToken(payload);
      if (!token) return sendJson(res, 400, { ok: false, error: "Missing token" });

      await hubspotRequest(token, "GET", "/crm/v3/objects/companies", null, { limit: 1, archived: "false" });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 401, { ok: false, error: error.message || "HubSpot auth failed" });
    }
  }

  if (req.method === "POST" && req.url === "/api/hubspot/refresh") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);
      const refreshToken = payload && typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
      if (!refreshToken) return sendJson(res, 400, { ok: false, error: "Missing refresh_token" });
      if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
        return sendJson(res, 400, { ok: false, error: "Missing OAuth client config" });
      }
      const bodyParams = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        refresh_token: refreshToken,
      });
      const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams,
      });
      const text = await tokenRes.text();
      const json = parseJson(text) || {};
      if (!tokenRes.ok) {
        return sendJson(res, 400, {
          ok: false,
          error: text ? text.slice(0, 400) : tokenRes.statusText,
        });
      }
      return sendJson(res, 200, { ok: true, token: json });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Refresh failed" });
    }
  }

  // Store tokens in database (for multi-tenant support)
  if (req.method === "POST" && req.url === "/api/tokens/store") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { email, hubId, accessToken, refreshToken, expiresIn, scopes } = payload;

      if (!email) return sendJson(res, 400, { ok: false, error: "Missing email" });
      if (!hubId) return sendJson(res, 400, { ok: false, error: "Missing hubId" });
      if (!accessToken) return sendJson(res, 400, { ok: false, error: "Missing accessToken" });
      if (!refreshToken) return sendJson(res, 400, { ok: false, error: "Missing refreshToken" });

      const dbAvailable = await db.isDatabaseAvailable();
      if (!dbAvailable) {
        return sendJson(res, 503, { ok: false, error: "Database not available" });
      }

      const user = await db.getOrCreateUser(email);
      await db.storeTokens({
        userId: user.id,
        hubId,
        accessToken,
        refreshToken,
        expiresIn: expiresIn || 3600,
        scopes: scopes || OAUTH_SCOPES,
      });

      return sendJson(res, 200, { ok: true, userId: user.id });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to store tokens" });
    }
  }

  // Get stored tokens for a user
  if (req.method === "POST" && req.url === "/api/tokens/get") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { email, hubId } = payload;

      if (!email) return sendJson(res, 400, { ok: false, error: "Missing email" });

      const dbAvailable = await db.isDatabaseAvailable();
      if (!dbAvailable) {
        return sendJson(res, 503, { ok: false, error: "Database not available" });
      }

      const user = await db.getOrCreateUser(email);
      const tokens = hubId
        ? await db.getTokens(user.id, hubId)
        : await db.getTokens(user.id);

      if (!tokens) {
        return sendJson(res, 404, { ok: false, error: "No tokens found" });
      }

      return sendJson(res, 200, {
        ok: true,
        tokens: {
          hubId: tokens.hubId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          expiresInSeconds: tokens.expiresInSeconds,
          isExpired: tokens.isExpired,
          scopes: tokens.scopes,
        },
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to get tokens" });
    }
  }

  // Auto-refresh tokens if needed
  if (req.method === "POST" && req.url === "/api/tokens/auto-refresh") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { email, hubId } = payload;

      if (!email) return sendJson(res, 400, { ok: false, error: "Missing email" });

      const dbAvailable = await db.isDatabaseAvailable();
      if (!dbAvailable) {
        return sendJson(res, 503, { ok: false, error: "Database not available" });
      }

      if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
        return sendJson(res, 400, { ok: false, error: "OAuth not configured" });
      }

      const user = await db.getOrCreateUser(email);

      // Refresh function that calls HubSpot API
      const refreshFn = async (refreshToken) => {
        const bodyParams = new URLSearchParams({
          grant_type: "refresh_token",
          client_id: HUBSPOT_CLIENT_ID,
          client_secret: HUBSPOT_CLIENT_SECRET,
          refresh_token: refreshToken,
        });
        const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: bodyParams,
        });
        const text = await tokenRes.text();
        if (!tokenRes.ok) {
          throw new Error(`Refresh failed: ${text.slice(0, 200)}`);
        }
        return parseJson(text);
      };

      const tokens = await db.refreshTokensIfNeeded(user.id, hubId, refreshFn);

      if (!tokens) {
        return sendJson(res, 404, { ok: false, error: "No tokens found" });
      }

      return sendJson(res, 200, {
        ok: true,
        refreshed: tokens.expiresInSeconds > 300 ? false : true,
        tokens: {
          hubId: tokens.hubId,
          accessToken: tokens.accessToken,
          expiresAt: tokens.expiresAt,
          expiresInSeconds: tokens.expiresInSeconds,
        },
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Auto-refresh failed" });
    }
  }

  // List all connected HubSpot portals for a user
  if (req.method === "POST" && req.url === "/api/tokens/list") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { email } = payload;

      if (!email) return sendJson(res, 400, { ok: false, error: "Missing email" });

      const dbAvailable = await db.isDatabaseAvailable();
      if (!dbAvailable) {
        return sendJson(res, 503, { ok: false, error: "Database not available" });
      }

      const user = await db.getOrCreateUser(email);
      const allTokens = await db.getAllTokensForUser(user.id);

      return sendJson(res, 200, {
        ok: true,
        portals: allTokens.map((t) => ({
          hubId: t.hubId,
          expiresAt: t.expiresAt,
          expiresInSeconds: t.expiresInSeconds,
          isExpired: t.isExpired,
          scopes: t.scopes,
        })),
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to list tokens" });
    }
  }

  // Delete tokens (disconnect HubSpot portal)
  if (req.method === "POST" && req.url === "/api/tokens/delete") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { email, hubId } = payload;

      if (!email) return sendJson(res, 400, { ok: false, error: "Missing email" });

      const dbAvailable = await db.isDatabaseAvailable();
      if (!dbAvailable) {
        return sendJson(res, 503, { ok: false, error: "Database not available" });
      }

      const user = await db.getOrCreateUser(email);
      const deleted = await db.deleteTokens(user.id, hubId);

      return sendJson(res, 200, { ok: true, deleted });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to delete tokens" });
    }
  }

  if (req.method === "POST" && req.url === "/api/properties/init") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);
      const token = getToken(payload);
      if (!token) return sendJson(res, 400, { ok: false, error: "Missing token" });

      const includeContacts = payload && payload.includeContacts !== false;
      const includeCompanies = payload && payload.includeCompanies !== false;

      const results = {};
      if (includeContacts) {
        results.contacts = await ensureProperties(token, "contacts", CONTACT_PROPERTIES);
      }
      if (includeCompanies) {
        results.companies = await ensureProperties(token, "companies", COMPANY_PROPERTIES);
      }

      return sendJson(res, 200, { ok: true, results });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to create properties" });
    }
  }

  if (req.method === "POST" && req.url === "/api/script/run") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);
      const token = getToken(payload);
      const code = payload && typeof payload.code === "string" ? payload.code : "";
      if (!code) return sendJson(res, 400, { ok: false, error: "Missing code" });

      const replaced = replaceToken(code, token);
      const result = await runUserCode(replaced.source, token);
      return sendJson(res, 200, {
        ...result,
        tokenReplaced: replaced.replaced,
        tokenInjectedAtTop: replaced.injected,
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Server error" });
    }
  }

  // ============================================================
  // Web Extraction API Endpoints
  // ============================================================

  // Single URL extraction
  if (req.method === "POST" && req.url === "/api/extract/single") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { url, preset, customPrompt, outputFormat, browserEnv, writeToHubspot } = payload;

      if (!url) return sendJson(res, 400, { ok: false, error: "Missing url" });

      // Dynamically import the extractor (ES module)
      const { extractFromUrl, extractAndWriteToHubspot } = await import("../extractor/index.mjs");

      const extractOptions = {
        preset: preset || "custom",
        customPrompt,
        outputFormat,
        browserEnv: browserEnv || "LOCAL",
        headless: true,
        timeout: 90000,
      };

      let result;
      if (writeToHubspot) {
        const hubspotToken = getToken(payload);
        result = await extractAndWriteToHubspot(url, {
          ...extractOptions,
          hubspotToken,
          companyId: payload.companyId,
        });
      } else {
        result = await extractFromUrl(url, extractOptions);
      }

      return sendJson(res, 200, { ok: result.success, ...result });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Extraction failed" });
    }
  }

  // Batch URL extraction
  if (req.method === "POST" && req.url === "/api/extract/batch") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { urls, preset, customPrompt, outputFormat, browserEnv, concurrency } = payload;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return sendJson(res, 400, { ok: false, error: "Missing or empty urls array" });
      }

      const { extractBatch } = await import("../extractor/index.mjs");

      const result = await extractBatch(urls, {
        preset: preset || "custom",
        customPrompt,
        outputFormat,
        browserEnv: browserEnv || "LOCAL",
        concurrency: concurrency || 3,
        headless: true,
        timeout: 90000,
      });

      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Batch extraction failed" });
    }
  }

  // Parse CSV and extract URLs
  if (req.method === "POST" && req.url === "/api/extract/parse-csv") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { csvContent, urlColumn } = payload;

      if (!csvContent) return sendJson(res, 400, { ok: false, error: "Missing csvContent" });

      const { parseUrlsFromCsv } = await import("../extractor/index.mjs");
      const urls = parseUrlsFromCsv(csvContent, urlColumn);

      return sendJson(res, 200, { ok: true, urls, count: urls.length });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "CSV parsing failed" });
    }
  }

  // Get available presets
  if (req.method === "GET" && req.url === "/api/extract/presets") {
    return sendJson(res, 200, {
      ok: true,
      presets: [
        { id: "menu", name: "Menu", description: "Extract restaurant menu with sections, items, and prices" },
        { id: "business-info", name: "Business Info", description: "Extract owner, founding story, contact info" },
        { id: "custom", name: "Custom", description: "Define your own extraction prompt and format" },
      ],
    });
  }

  // Get companies from HubSpot that need extraction
  if (req.method === "POST" && req.url === "/api/extract/hubspot-companies") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);
      const token = getToken(payload);

      if (!token) return sendJson(res, 400, { ok: false, error: "Missing token" });

      const { getCompaniesNeedingExtraction } = await import("../extractor/outputs/hubspot.mjs");
      const companies = await getCompaniesNeedingExtraction(token, payload.limit || 100);

      return sendJson(res, 200, {
        ok: true,
        companies: companies.map((c) => ({
          id: c.id,
          name: c.properties?.name,
          website: c.properties?.website,
          domain: c.properties?.domain,
        })),
        count: companies.length,
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Failed to fetch companies" });
    }
  }

  // ============================================================
  // Menu Hunter API Endpoint
  // ============================================================

  // Hunt for menu from any restaurant website
  if (req.method === "POST" && req.url === "/api/extract/hunt-menu") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { url, location, format, browserEnv } = payload;

      if (!url) return sendJson(res, 400, { ok: false, error: "Missing url" });

      const { huntMenu } = await import("../extractor/menu-hunter.mjs");

      const result = await huntMenu(url, {
        location: location || "Austin TX",
        format: format || "detailed",
        browserEnv: browserEnv || "LOCAL",
        headless: true,
        timeout: 120000,
      });

      return sendJson(res, 200, { ok: result.success, ...result });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Menu hunt failed" });
    }
  }

  // Batch menu hunt
  if (req.method === "POST" && req.url === "/api/extract/hunt-menu-batch") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { urls, location, format, browserEnv, concurrency } = payload;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return sendJson(res, 400, { ok: false, error: "Missing or empty urls array" });
      }

      const { huntMenuBatch } = await import("../extractor/menu-hunter.mjs");

      const result = await huntMenuBatch(urls, {
        location: location || "Austin TX",
        format: format || "detailed",
        browserEnv: browserEnv || "LOCAL",
        concurrency: concurrency || 2,
        headless: true,
        timeout: 120000,
      });

      return sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Batch menu hunt failed" });
    }
  }

  // ============================================================
  // LinkedIn Automation API Endpoints
  // ============================================================

  // LinkedIn session status
  if (req.method === "GET" && req.url === "/api/linkedin/status") {
    try {
      const { getSession } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });
      const status = session.getStatus();
      return sendJson(res, 200, { ok: true, ...status });
    } catch (error) {
      return sendJson(res, 200, { ok: true, isLoggedIn: false, error: error.message });
    }
  }

  // LinkedIn login
  if (req.method === "POST" && req.url === "/api/linkedin/login") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body) || {};

      const { getSession } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });
      const loggedIn = await session.login(payload.forceLogin);

      return sendJson(res, 200, {
        ok: true,
        loggedIn,
        profile: session.profile,
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Login failed" });
    }
  }

  // LinkedIn logout
  if (req.method === "POST" && req.url === "/api/linkedin/logout") {
    try {
      const { getSession, closeSession } = await import("../linkedin/index.mjs");
      const session = await getSession();
      await session.clearCookies();
      await closeSession();

      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Logout failed" });
    }
  }

  // LinkedIn search
  if (req.method === "POST" && req.url === "/api/linkedin/search") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { query, company, location, title, limit } = payload;

      if (!query && !company) {
        return sendJson(res, 400, { ok: false, error: "Either query or company is required" });
      }

      const { getSession, searchPeople } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await searchPeople(session, { query, company, location, title, limit: limit || 10 });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Search failed" });
    }
  }

  // LinkedIn company people search
  if (req.method === "POST" && req.url === "/api/linkedin/company-people") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { companyName, companyUrl, roles, limit } = payload;

      if (!companyName && !companyUrl) {
        return sendJson(res, 400, { ok: false, error: "Either companyName or companyUrl is required" });
      }

      const { getSession, findPeopleAtCompany } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await findPeopleAtCompany(session, {
        companyName,
        companyUrl,
        roles: roles || [],
        limit: limit || 10,
      });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Company search failed" });
    }
  }

  // LinkedIn profile navigation (flexible input)
  if (req.method === "POST" && req.url === "/api/linkedin/profile") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profileUrl, profileId, personName, companyName } = payload;

      if (!profileUrl && !profileId && !personName) {
        return sendJson(res, 400, { ok: false, error: "Provide profileUrl, profileId, or personName" });
      }

      const { getSession, navigateToProfile } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await navigateToProfile(session, { profileUrl, profileId, personName, companyName });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Navigation failed" });
    }
  }

  // LinkedIn profile extraction
  if (req.method === "POST" && req.url === "/api/linkedin/profile/extract") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profileUrl, profileId, personName, companyName } = payload;

      const { getSession, navigateToProfile, extractProfile } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      // Navigate first if needed
      if (profileUrl || profileId || personName) {
        await navigateToProfile(session, { profileUrl, profileId, personName, companyName });
      }

      const result = await extractProfile(session);

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Extraction failed" });
    }
  }

  // LinkedIn send connection request
  if (req.method === "POST" && req.url === "/api/linkedin/connect") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profileUrl, profileId, personName, companyName, note, useAI, hubspotContext } = payload;

      if (!profileUrl && !profileId && !personName) {
        return sendJson(res, 400, { ok: false, error: "Provide profileUrl, profileId, or personName" });
      }

      const { getSession, sendConnectionRequest } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await sendConnectionRequest(session, {
        profileUrl,
        profileId,
        personName,
        companyName,
        note,
        useAI: useAI || false,
        hubspotContext,
      });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Connection failed" });
    }
  }

  // LinkedIn send message
  if (req.method === "POST" && req.url === "/api/linkedin/message") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profileUrl, profileId, personName, companyName, message, useAI, hubspotContext } = payload;

      if (!profileUrl && !profileId && !personName) {
        return sendJson(res, 400, { ok: false, error: "Provide profileUrl, profileId, or personName" });
      }

      if (!message && !useAI) {
        return sendJson(res, 400, { ok: false, error: "Message is required (or set useAI: true)" });
      }

      const { getSession, sendMessage } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await sendMessage(session, {
        profileUrl,
        profileId,
        personName,
        companyName,
        message,
        useAI: useAI || false,
        hubspotContext,
      });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Message failed" });
    }
  }

  // LinkedIn message preview (AI-enhanced without sending)
  if (req.method === "POST" && req.url === "/api/linkedin/message/preview") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profileUrl, template, hubspotContext } = payload;

      if (!profileUrl) {
        return sendJson(res, 400, { ok: false, error: "profileUrl is required" });
      }

      const { getSession, previewMessage } = await import("../linkedin/index.mjs");
      const session = await getSession({ headless: false });

      const result = await previewMessage(session, { profileUrl, template, hubspotContext });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Preview failed" });
    }
  }

  // LinkedIn save profile to HubSpot
  if (req.method === "POST" && req.url === "/api/linkedin/save-to-hubspot") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profile, companyId } = payload;
      const token = getToken(payload);

      if (!token) return sendJson(res, 400, { ok: false, error: "Missing HubSpot token" });
      if (!profile) return sendJson(res, 400, { ok: false, error: "Missing profile data" });

      const { saveProfileToHubSpot } = await import("../linkedin/index.mjs");

      const result = await saveProfileToHubSpot(token, profile, { companyId });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Save failed" });
    }
  }

  // LinkedIn batch enrich (save multiple profiles to HubSpot)
  if (req.method === "POST" && req.url === "/api/linkedin/batch-enrich") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { profiles, companyId } = payload;
      const token = getToken(payload);

      if (!token) return sendJson(res, 400, { ok: false, error: "Missing HubSpot token" });
      if (!profiles || !Array.isArray(profiles)) {
        return sendJson(res, 400, { ok: false, error: "profiles array is required" });
      }

      const { batchSaveToHubSpot } = await import("../linkedin/index.mjs");

      const result = await batchSaveToHubSpot(token, profiles, { companyId });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Batch save failed" });
    }
  }

  // LinkedIn full workflow: engage company contacts
  if (req.method === "POST" && req.url === "/api/linkedin/engage-company") {
    try {
      const body = await readBody(req);
      const payload = parseJson(body);

      if (!payload) return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });

      const { companyName, roles, limit, connect, connectionNote, useAI, saveToHubSpot, hubspotCompanyId } = payload;
      const hubspotToken = getToken(payload);

      if (!companyName) {
        return sendJson(res, 400, { ok: false, error: "companyName is required" });
      }

      const { engageCompanyContacts } = await import("../linkedin/index.mjs");

      const result = await engageCompanyContacts({
        companyName,
        roles: roles || [],
        limit: limit || 10,
        connect: connect || false,
        connectionNote,
        useAI: useAI || false,
        saveToHubSpot: saveToHubSpot || false,
        hubspotToken,
        hubspotCompanyId,
      });

      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || "Engagement workflow failed" });
    }
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

const listenWithRetry = (attemptsLeft) => {
  let preferredPort = Number(process.env.PORT || 0);
  if (!preferredPort && HUBSPOT_REDIRECT_URI) {
    try {
      const parsed = new URL(HUBSPOT_REDIRECT_URI);
      preferredPort = Number(parsed.port || 0);
    } catch (_) {
      preferredPort = 0;
    }
  }
  const port = preferredPort || pickRandomPort();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      return listenWithRetry(attemptsLeft - 1);
    }
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`GTM console listening on http://localhost:${port}`);
  });
};

listenWithRetry(5);
