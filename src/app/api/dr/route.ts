import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  buildDrDashboard,
  runAutomatedBackup,
  validateBackup,
  triggerFailover,
  runRecoveryDrill,
} from "@/lib/dr";

function staff(role: string) {
  return ["ADMIN", "DEVELOPER"].includes(role);
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!staff(session.role)) {
      return NextResponse.json({ error: "DR access required" }, { status: 403 });
    }
    return NextResponse.json(await buildDrDashboard());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!staff(session.role)) {
      return NextResponse.json({ error: "DR access required" }, { status: 403 });
    }
    const body = await req.json();
    const action = body.action as string;

    if (action === "backup") {
      return NextResponse.json(await runAutomatedBackup(session.id));
    }
    if (action === "validate_backup") {
      return NextResponse.json(await validateBackup(String(body.backupId), session.id));
    }
    if (action === "failover") {
      return NextResponse.json({
        event: await triggerFailover({
          fromRegion: String(body.fromRegion),
          toRegion: String(body.toRegion),
          reason: String(body.reason || "Manual failover drill"),
          actorId: session.id,
          automated: Boolean(body.automated),
        }),
      });
    }
    if (action === "recovery_drill") {
      return NextResponse.json(
        await runRecoveryDrill({
          name: String(body.name || "Ad-hoc recovery drill"),
          drillType: body.drillType ? String(body.drillType) : undefined,
          actorId: session.id,
        })
      );
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
