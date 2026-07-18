import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";

function secret() {
  return new TextEncoder().encode(config.app.jwtSecret);
}

export async function createPending2faToken(userId: string) {
  return new SignJWT({ userId, purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function verifyPending2faToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "2fa") return null;
    return payload.userId as string;
  } catch {
    return null;
  }
}
