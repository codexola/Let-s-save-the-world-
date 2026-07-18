import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  buildEnterpriseDashboard,
  decideApproval,
  createOrganization,
} from "@/lib/enterprise";

function staff(role: string) {
  return ["ADMIN", "DEVELOPER", "HOSPITAL", "COMPANY"].includes(role);
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!staff(session.role)) {
      return NextResponse.json({ error: "Enterprise access required" }, { status: 403 });
    }
    return NextResponse.json(await buildEnterpriseDashboard(session.id));
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
      return NextResponse.json({ error: "Enterprise access required" }, { status: 403 });
    }
    const body = await req.json();
    const action = body.action as string;

    if (action === "decide_approval") {
      return NextResponse.json({
        approval: await decideApproval({
          approvalId: String(body.approvalId),
          deciderId: session.id,
          decision: body.decision === "rejected" ? "rejected" : "approved",
        }),
      });
    }
    if (action === "create_org") {
      return NextResponse.json({
        organization: await createOrganization({
          name: String(body.name),
          code: String(body.code),
          countryCode: body.countryCode ? String(body.countryCode) : undefined,
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
