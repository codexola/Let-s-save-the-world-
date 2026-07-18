import { NextRequest, NextResponse } from "next/server";
import { runRetentionJob } from "@/lib/privacy";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "medcare-cron-dev";
  const auth = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret");
  if (auth !== `Bearer ${secret}` && auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runRetentionJob();
  return NextResponse.json({ ok: true, results, ranAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
