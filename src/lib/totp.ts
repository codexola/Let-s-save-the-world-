import { Secret, TOTP } from "otpauth";
import crypto from "crypto";

export function generateTwoFactorSecret(email: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "MedCare",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotp(secretBase32: string, token: string): boolean {
  const totp = new TOTP({
    issuer: "MedCare",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}
