import { NextRequest, NextResponse } from "next/server";
import { requirePermission, audit } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { runRetentionJob } from "@/lib/privacy";
import {
  buildGrcDashboard,
  generateRegulatoryReport,
  upsertCompliancePolicy,
} from "@/lib/grc-platform";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.AUDIT_VIEW);
    const dash = await buildGrcDashboard();
    const openDsrs = await prisma.dataSubjectRequest.findMany({
      where: { status: "open" },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      frameworks: [
        { id: "appi", name: "APPI (Japan)", notes: "Purpose limitation, consent, security controls, retention" },
        { id: "hipaa", name: "HIPAA-aligned (US)", notes: "Access controls, audit trails, minimum necessary" },
        { id: "gdpr", name: "GDPR (EU)", notes: "Lawful basis, portability, erasure, DPIA-ready logging" },
      ],
      ...dash,
      stats: dash.complianceDashboard.stats,
      retentionPolicies: dash.retentionSchedules,
      dataSubjectRequests: openDsrs,
      consentCatalog: dash.consentManagement.catalog,
      policyVersion: dash.consentManagement.policyVersion,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const body = await req.json();

    if (body.action === "update_retention") {
      const policy = await prisma.retentionPolicy.upsert({
        where: { resource: String(body.resource) },
        update: {
          retainDays: Number(body.retainDays),
          action: String(body.actionType || "anonymize"),
          description: body.description || null,
          active: body.active !== false,
        },
        create: {
          resource: String(body.resource),
          retainDays: Number(body.retainDays) || 365,
          action: String(body.actionType || "anonymize"),
          description: body.description || null,
        },
      });
      await audit(session.id, "grc.retention_update", "RetentionPolicy", policy.id);
      return NextResponse.json({ policy });
    }

    if (body.action === "resolve_dsr") {
      const dsr = await prisma.dataSubjectRequest.update({
        where: { id: String(body.id) },
        data: {
          status: String(body.status || "completed"),
          resolution: body.resolution ? String(body.resolution) : null,
          completedAt: new Date(),
        },
      });
      await audit(session.id, "grc.dsr_resolve", "DataSubjectRequest", dsr.id);
      return NextResponse.json({ request: dsr });
    }

    if (body.action === "run_retention") {
      const results = await runRetentionJob();
      return NextResponse.json({ ok: true, results });
    }

    if (body.action === "regulatory_report") {
      const report = await generateRegulatoryReport({
        framework: String(body.framework || "APPI"),
        period: String(body.period || new Date().toISOString().slice(0, 7)),
        actorId: session.id,
      });
      return NextResponse.json({ report });
    }

    if (body.action === "upsert_policy") {
      const policy = await upsertCompliancePolicy({
        code: String(body.code),
        title: String(body.title),
        framework: String(body.framework || "APPI"),
        body: String(body.body || ""),
        actorId: session.id,
      });
      return NextResponse.json({ policy });
    }

    if (body.action === "add_vendor") {
      const vendor = await prisma.vendorRisk.create({
        data: {
          vendorName: String(body.vendorName),
          category: String(body.category || "saas"),
          riskScore: Number(body.riskScore || 50),
          notes: body.notes ? String(body.notes) : null,
        },
      });
      return NextResponse.json({ vendor });
    }

    if (body.action === "complete_audit") {
      const row = await prisma.internalAudit.update({
        where: { id: String(body.auditId) },
        data: {
          status: "completed",
          findings: body.findings ? String(body.findings) : "No material findings",
          completedAt: new Date(),
        },
      });
      return NextResponse.json({ audit: row });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
