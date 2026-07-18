import { NextRequest, NextResponse } from "next/server";
import { requirePermission, audit } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import {
  ensureDefaultRetentionPolicies,
  runRetentionJob,
  CONSENT_TYPES,
  PRIVACY_POLICY_VERSION,
} from "@/lib/privacy";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.AUDIT_VIEW);
    await ensureDefaultRetentionPolicies();

    const [policies, openDsrs, consentsGranted, accessLogs, auditCount] = await Promise.all([
      prisma.retentionPolicy.findMany({ orderBy: { resource: "asc" } }),
      prisma.dataSubjectRequest.findMany({
        where: { status: "open" },
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.consent.count({ where: { granted: true, withdrawnAt: null } }),
      prisma.accessLog.count(),
      prisma.auditLog.count(),
    ]);

    return NextResponse.json({
      frameworks: [
        {
          id: "appi",
          name: "APPI (Japan)",
          notes: "Purpose limitation, consent, security controls, retention, disclosure records",
        },
        {
          id: "hipaa",
          name: "HIPAA-aligned (US)",
          notes: "Access controls, audit trails, minimum necessary, patient access/amendment patterns",
        },
        {
          id: "gdpr",
          name: "GDPR (EU)",
          notes: "Lawful basis, portability, erasure, DPIA-ready logging",
        },
      ],
      policyVersion: PRIVACY_POLICY_VERSION,
      consentCatalog: CONSENT_TYPES,
      stats: { consentsGranted, accessLogs, auditCount, openDsrs: openDsrs.length },
      retentionPolicies: policies,
      dataSubjectRequests: openDsrs,
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
