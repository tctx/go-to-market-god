const crypto = require("crypto");
const { env } = require("./env");

const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
if (key.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
}

const encryptString = (plaintext) => {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
};

const decryptString = (payload) => {
  if (!payload) return "";
  const [ivB64, dataB64, tagB64] = payload.split(":");
  if (!ivB64 || !dataB64 || !tagB64) throw new Error("Invalid encrypted payload.");
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
};

const hashState = (value) => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

const randomState = () => crypto.randomBytes(24).toString("hex");

module.exports = {
  encryptString,
  decryptString,
  hashState,
  randomState,
};
