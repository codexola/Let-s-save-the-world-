import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import {
  buildPublicHealthDashboard,
  createOutbreakAlert,
  generateGovernmentReport,
} from "@/lib/public-health";

export async function GET() {
  try {
    await requireSession();
    const dashboard = await buildPublicHealthDashboard();
    return NextResponse.json(dashboard);
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

    if (action === "create_outbreak" || action === "createOutbreak") {
      if (!["ADMIN", "DEVELOPER", "HOSPITAL", "DOCTOR"].includes(session.role)) {
        return NextResponse.json({ error: "Public health role required" }, { status: 403 });
      }
      const alert = await createOutbreakAlert({
        disease: String(body.disease),
        region: String(body.region || "National"),
        severity: body.severity ? String(body.severity) : "moderate",
        caseCount: body.caseCount != null ? Number(body.caseCount) : 0,
        message: String(body.message || body.summary || "Outbreak alert issued"),
      });
      await audit(session.id, "public_health.outbreak", "OutbreakAlert", alert.id);
      return NextResponse.json({ alert });
    }

    if (
      action === "generate_report" ||
      action === "submitReport" ||
      action === "government_report"
    ) {
      if (!["ADMIN", "DEVELOPER", "HOSPITAL"].includes(session.role)) {
        return NextResponse.json({ error: "Reporting role required" }, { status: 403 });
      }
      const result = await generateGovernmentReport({
        title: body.title ? String(body.title) : undefined,
        reportType: body.reportType ? String(body.reportType) : undefined,
        region: body.region ? String(body.region) : undefined,
        summary: body.summary ? String(body.summary) : undefined,
      });
      await audit(session.id, "public_health.report", "PublicHealthReport", result.report.id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
