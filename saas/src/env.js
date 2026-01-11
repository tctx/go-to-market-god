const path = require("path");
const { z } = require("zod");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().optional(),
  JWT_SECRET: z.string().min(24),
  ENCRYPTION_KEY: z.string().min(20),
  APP_BASE_URL: z.string().url().optional(),
  APP_SUCCESS_REDIRECT: z.string().url().optional(),
  HUBSPOT_CLIENT_ID: z.string().optional(),
  HUBSPOT_CLIENT_SECRET: z.string().optional(),
  HUBSPOT_REDIRECT_URI: z.string().url().optional(),
  HUBSPOT_OAUTH_SCOPES: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GOOGLE_OAUTH_SCOPES: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Keep the error minimal so secrets do not leak.
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
}

const env = parsed.data;

const parseScopes = (value, fallback) => {
  if (!value) return fallback;
  const cleaned = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length ? cleaned : fallback;
};

const hubspotScopes = parseScopes(env.HUBSPOT_OAUTH_SCOPES, [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.notes.read",
  "crm.objects.notes.write",
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
  "crm.schemas.companies.read",
  "crm.schemas.companies.write",
]);

const googleScopes = parseScopes(env.GOOGLE_OAUTH_SCOPES, [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "openid",
  "email",
]);

const port = Number(env.PORT || 8080);
const baseUrl = env.APP_BASE_URL || `http://localhost:${port}`;

module.exports = {
  env,
  hubspotScopes,
  googleScopes,
  port,
  baseUrl,
};
