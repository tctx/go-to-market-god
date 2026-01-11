/**
 * Database module for HubSpot OAuth token storage
 * - PostgreSQL connection pool
 * - AES-256-GCM encryption for tokens
 * - CRUD operations for users and tokens
 * - Automatic token refresh
 */

const crypto = require("crypto");

// Lazy-load pg to allow app to run without database
let Pool = null;
let pool = null;

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment (must be 32 bytes / 64 hex chars)
 */
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;

  // If hex string, convert to buffer
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  // If raw 32-byte string
  if (key.length === 32) {
    return Buffer.from(key);
  }

  console.warn("ENCRYPTION_KEY must be 32 bytes (64 hex chars). Token encryption disabled.");
  return null;
};

/**
 * Encrypt a string using AES-256-GCM
 */
const encrypt = (text) => {
  const key = getEncryptionKey();
  if (!key) return text; // No encryption if no key

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

/**
 * Decrypt a string using AES-256-GCM
 */
const decrypt = (encryptedText) => {
  const key = getEncryptionKey();
  if (!key) return encryptedText; // No decryption if no key

  // Check if it's actually encrypted (has our format)
  if (!encryptedText.includes(":")) return encryptedText;

  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;

  const [ivHex, authTagHex, encrypted] = parts;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error.message);
    return null;
  }
};

/**
 * Initialize database connection pool
 */
const initPool = () => {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  try {
    if (!Pool) {
      Pool = require("pg").Pool;
    }

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err);
    });

    return pool;
  } catch (error) {
    console.error("Failed to initialize database pool:", error.message);
    return null;
  }
};

/**
 * Check if database is available
 */
const isDatabaseAvailable = async () => {
  const p = initPool();
  if (!p) return false;

  try {
    const client = await p.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    console.error("Database not available:", error.message);
    return false;
  }
};

/**
 * Get or create a user by email
 */
const getOrCreateUser = async (email, name = null) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  // Try to get existing user
  const existing = await p.query(
    "SELECT id, email, name FROM users WHERE email = $1",
    [email.toLowerCase()]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new user
  const result = await p.query(
    "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name",
    [email.toLowerCase(), name]
  );

  return result.rows[0];
};

/**
 * Store OAuth tokens for a user
 */
const storeTokens = async ({
  userId,
  hubId,
  accessToken,
  refreshToken,
  expiresIn,
  scopes = [],
}) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const accessTokenEncrypted = encrypt(accessToken);
  const refreshTokenEncrypted = encrypt(refreshToken);

  const result = await p.query(
    `INSERT INTO hubspot_tokens
      (user_id, hub_id, access_token_encrypted, refresh_token_encrypted, expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, hub_id) DO UPDATE SET
       access_token_encrypted = $3,
       refresh_token_encrypted = $4,
       expires_at = $5,
       scopes = $6,
       updated_at = NOW()
     RETURNING id`,
    [userId, hubId, accessTokenEncrypted, refreshTokenEncrypted, expiresAt, scopes]
  );

  return result.rows[0];
};

/**
 * Get tokens for a user (decrypted)
 */
const getTokens = async (userId, hubId = null) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  let query = `
    SELECT id, user_id, hub_id, access_token_encrypted, refresh_token_encrypted,
           expires_at, scopes, created_at, updated_at
    FROM hubspot_tokens
    WHERE user_id = $1
  `;
  const params = [userId];

  if (hubId) {
    query += " AND hub_id = $2";
    params.push(hubId);
  }

  query += " ORDER BY updated_at DESC LIMIT 1";

  const result = await p.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    hubId: row.hub_id,
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    expiresAt: row.expires_at,
    scopes: row.scopes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isExpired: new Date() > new Date(row.expires_at),
    expiresInSeconds: Math.floor((new Date(row.expires_at) - new Date()) / 1000),
  };
};

/**
 * Get all tokens for a user (all connected HubSpot portals)
 */
const getAllTokensForUser = async (userId) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  const result = await p.query(
    `SELECT id, user_id, hub_id, access_token_encrypted, refresh_token_encrypted,
            expires_at, scopes, created_at, updated_at
     FROM hubspot_tokens
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    hubId: row.hub_id,
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    expiresAt: row.expires_at,
    scopes: row.scopes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isExpired: new Date() > new Date(row.expires_at),
    expiresInSeconds: Math.floor((new Date(row.expires_at) - new Date()) / 1000),
  }));
};

/**
 * Delete tokens for a user/hub
 */
const deleteTokens = async (userId, hubId = null) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  let query = "DELETE FROM hubspot_tokens WHERE user_id = $1";
  const params = [userId];

  if (hubId) {
    query += " AND hub_id = $2";
    params.push(hubId);
  }

  const result = await p.query(query, params);
  return result.rowCount;
};

/**
 * Refresh tokens if they're about to expire
 * Returns the new tokens if refreshed, or existing tokens if still valid
 */
const refreshTokensIfNeeded = async (userId, hubId, refreshFn) => {
  const tokens = await getTokens(userId, hubId);
  if (!tokens) return null;

  // Refresh if less than 5 minutes remaining
  const REFRESH_THRESHOLD_SECONDS = 300;

  if (tokens.expiresInSeconds > REFRESH_THRESHOLD_SECONDS) {
    return tokens; // Still valid
  }

  // Call the refresh function (provided by caller, makes HubSpot API call)
  try {
    const newTokens = await refreshFn(tokens.refreshToken);

    // Store the new tokens
    await storeTokens({
      userId,
      hubId,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token,
      expiresIn: newTokens.expires_in,
      scopes: tokens.scopes,
    });

    return await getTokens(userId, hubId);
  } catch (error) {
    console.error("Failed to refresh tokens:", error.message);
    throw error;
  }
};

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
  const p = initPool();
  if (!p) throw new Error("Database not configured");

  const result = await p.query(
    "SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1",
    [userId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Close the database pool (for graceful shutdown)
 */
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

module.exports = {
  initPool,
  isDatabaseAvailable,
  getOrCreateUser,
  getUserById,
  storeTokens,
  getTokens,
  getAllTokensForUser,
  deleteTokens,
  refreshTokensIfNeeded,
  closePool,
  encrypt,
  decrypt,
};
