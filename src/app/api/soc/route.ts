import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  buildSocDashboard,
  openIncident,
  respondIncident,
  acknowledgeAlert,
  runMalwareScan,
  exportToSiem,
  detectAccountAnomaly,
  raiseSecurityAlert,
} from "@/lib/soc";

function staff(role: string) {
  return ["ADMIN", "DEVELOPER", "HOSPITAL"].includes(role);
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!staff(session.role)) {
      return NextResponse.json({ error: "SOC access required" }, { status: 403 });
    }
    return NextResponse.json(await buildSocDashboard());
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
      return NextResponse.json({ error: "SOC access required" }, { status: 403 });
    }
    const body = await req.json();
    const action = body.action as string;

    if (action === "open_incident") {
      const incident = await openIncident({
        title: String(body.title),
        severity: body.severity ? String(body.severity) : undefined,
        category: body.category ? String(body.category) : undefined,
        summary: String(body.summary || body.title),
        actorId: session.id,
      });
      return NextResponse.json({ incident });
    }
    if (action === "respond_incident") {
      const incident = await respondIncident({
        incidentId: String(body.incidentId),
        status: String(body.status),
        actorId: session.id,
      });
      return NextResponse.json({ incident });
    }
    if (action === "ack_alert") {
      return NextResponse.json({ alert: await acknowledgeAlert(String(body.alertId), session.id) });
    }
    if (action === "malware_scan") {
      return NextResponse.json({ scan: await runMalwareScan(String(body.target), session.id) });
    }
    if (action === "siem_export") {
      return NextResponse.json({ export: await exportToSiem(session.id) });
    }
    if (action === "anomaly") {
      return NextResponse.json({
        anomaly: await detectAccountAnomaly({
          email: body.email ? String(body.email) : undefined,
          userId: body.userId ? String(body.userId) : undefined,
          anomalyType: String(body.anomalyType || "suspicious_login"),
          score: Number(body.score || 0.7),
          details: String(body.details || "Manual anomaly flag"),
        }),
      });
    }
    if (action === "raise_alert") {
      return NextResponse.json({
        alert: await raiseSecurityAlert({
          title: String(body.title),
          severity: body.severity ? String(body.severity) : undefined,
          source: body.source ? String(body.source) : "soc",
          details: body.details ? String(body.details) : undefined,
          notifyAdminId: session.id,
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
