import crypto from "crypto";
import { config } from "./config";

const ALGO = "aes-256-gcm";

function fieldKey(): Buffer {
  return crypto.createHash("sha256").update(config.app.jwtSecret + ":medcare-field-aes256").digest();
}

/** AES-256-GCM field encryption for sensitive PII / PHI at rest */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, fieldKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes256:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptField(payload: string): string {
  if (!payload.startsWith("aes256:")) return payload;
  const parts = payload.split(":");
  if (parts.length !== 4) return payload;
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = crypto.createDecipheriv(ALGO, fieldKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export { encryptMessage, decryptMessage, looksEncrypted } from "./chat-crypto";
