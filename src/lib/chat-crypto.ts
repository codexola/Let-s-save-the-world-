import crypto from "crypto";
import { config } from "./config";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  return crypto.createHash("sha256").update(config.app.jwtSecret + ":medcare-chat").digest();
}

/** Encrypt plaintext for at-rest secure messaging */
export function encryptMessage(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptMessage(payload: string): string {
  if (!payload.startsWith("enc:v1:")) return payload;
  const parts = payload.split(":");
  if (parts.length !== 5) return payload;
  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const data = Buffer.from(parts[4], "base64url");
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function looksEncrypted(payload: string): boolean {
  return payload.startsWith("enc:v1:");
}
