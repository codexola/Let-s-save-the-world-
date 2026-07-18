import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { buildExecutiveDashboard, ensureAnalyticsPlatformSeed } from "@/lib/analytics-platform";

export async function GET() {
  try {
    const session = await requireSession();
    if (!["ADMIN", "DEVELOPER", "HOSPITAL", "COMPANY", "DOCTOR"].includes(session.role)) {
      return NextResponse.json({ error: "Executive access required" }, { status: 403 });
    }
    await ensureAnalyticsPlatformSeed();
    const dashboard = await buildExecutiveDashboard();
    return NextResponse.json(dashboard);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
