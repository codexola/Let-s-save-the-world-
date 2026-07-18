import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export async function GET() {
  if (!config.oauth.google.enabled) {
    return NextResponse.json({ error: "Google OAuth not configured", enabled: false }, { status: 503 });
  }
  return NextResponse.json({ error: "Set redirect URI", enabled: true });
}
