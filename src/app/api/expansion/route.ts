import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listExpansionModules, setExpansionStatus } from "@/lib/expansion";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json(await listExpansionModules());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "DEVELOPER"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    if (body.action === "set_status") {
      return NextResponse.json({
        module: await setExpansionStatus({
          key: String(body.key),
          status: String(body.status),
          actorId: session.id,
        }),
      });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
