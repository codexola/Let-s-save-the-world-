import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import {
  WEARABLE_PLATFORMS,
  WEARABLE_METRIC_TYPES,
  connectWearable,
  disconnectWearable,
  syncWearable,
  latestWearableMetrics,
} from "@/lib/wearables";
import { prisma } from "@/lib/db";
import { runRpmCheck } from "@/lib/rpm";

export async function GET() {
  try {
    const session = await requireSession();
    const connections = await prisma.wearableConnection.findMany({
      where: { userId: session.id },
      orderBy: { platform: "asc" },
    });
    const latest = await latestWearableMetrics(session.id);
    return NextResponse.json({
      platforms: WEARABLE_PLATFORMS,
      metricTypes: WEARABLE_METRIC_TYPES.map((m) => ({ type: m.type, unit: m.unit })),
      connections,
      latest,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "connect") {
      const conn = await connectWearable({
        userId: session.id,
        platform: String(body.platform),
        displayName: body.displayName ? String(body.displayName) : undefined,
      });
      return NextResponse.json({ connection: conn });
    }

    if (action === "disconnect") {
      const conn = await disconnectWearable(session.id, String(body.platform));
      return NextResponse.json({ connection: conn });
    }

    if (action === "sync" || action === "realtime_sync") {
      const result = await syncWearable(session.id, body.platform ? String(body.platform) : undefined);
      // Feed RPM after wearable sync
      try {
        await runRpmCheck(session.id, session.id);
      } catch {
        /* RPM optional if not enrolled */
      }
      await audit(session.id, "wearable.realtime_sync", "WearableConnection");
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
