import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { clientMeta, logAccess } from "@/lib/access-log";
import {
  CONSENT_TYPES,
  erasePatientData,
  exportPatientData,
  hasActiveConsent,
  listConsents,
  setConsent,
  runRetentionJob,
  ensureDefaultRetentionPolicies,
} from "@/lib/privacy";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const action = req.nextUrl.searchParams.get("action") || "overview";
    const meta = clientMeta(req);

    if (action === "consents") {
      const data = await listConsents(session.id);
      return NextResponse.json(data);
    }

    if (action === "export") {
      const ok = await hasActiveConsent(session.id, "privacy");
      if (!ok && session.role === "PATIENT") {
        return NextResponse.json(
          { error: "Privacy consent required before data export (APPI/GDPR)" },
          { status: 403 }
        );
      }
      await logAccess({
        userId: session.id,
        accessorId: session.id,
        action: "access.export",
        resource: "PatientDataPackage",
        resourceId: session.id,
        ...meta,
      });
      const data = await exportPatientData(session.id);
      return NextResponse.json({ export: data });
    }

    if (action === "access_logs") {
      if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
        const logs = await prisma.accessLog.findMany({
          where: { userId: session.id },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        return NextResponse.json({ logs });
      }
      const logs = await prisma.accessLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ logs });
    }

    if (action === "requests") {
      const requests = await prisma.dataSubjectRequest.findMany({
        where:
          session.role === "ADMIN" || session.role === "DEVELOPER"
            ? undefined
            : { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ requests });
    }

    const consents = await listConsents(session.id);
    return NextResponse.json({
      overview: {
        policyVersion: consents.policyVersion,
        frameworks: ["APPI (Japan)", "HIPAA-aligned (US)", "GDPR (EU)"],
        consentTypes: CONSENT_TYPES,
        currentConsents: consents.current,
      },
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
    const meta = clientMeta(req);

    if (body.action === "set_consent") {
      const row = await setConsent({
        userId: session.id,
        type: String(body.type),
        granted: Boolean(body.granted),
        purpose: body.purpose,
        legalBasis: body.legalBasis,
        ip: meta.ip,
        locale: session.locale || "ja",
      });
      return NextResponse.json({ ok: true, consent: row });
    }

    if (body.action === "accept_required") {
      for (const c of CONSENT_TYPES.filter((x) => x.required)) {
        await setConsent({
          userId: session.id,
          type: c.type,
          granted: true,
          ip: meta.ip,
          locale: session.locale || "ja",
        });
      }
      return NextResponse.json({ ok: true, message: "Required consents recorded" });
    }

    if (body.action === "export") {
      await logAccess({
        userId: session.id,
        accessorId: session.id,
        action: "access.export",
        resource: "PatientDataPackage",
        resourceId: session.id,
        ...meta,
      });
      const data = await exportPatientData(session.id);
      return NextResponse.json({ export: data });
    }

    if (body.action === "delete" || body.action === "erase") {
      if (body.confirm !== "DELETE") {
        return NextResponse.json(
          { error: 'Type confirm: "DELETE" to erase account data where legally applicable' },
          { status: 400 }
        );
      }
      const result = await erasePatientData(session.id, body.reason);
      return NextResponse.json(result);
    }

    if (body.action === "request") {
      const dsr = await prisma.dataSubjectRequest.create({
        data: {
          userId: session.id,
          type: String(body.type || "access"),
          details: body.details ? String(body.details) : null,
          status: "open",
        },
      });
      await audit(session.id, "privacy.dsr", "DataSubjectRequest", dsr.id);
      return NextResponse.json({ request: dsr });
    }

    if (body.action === "run_retention") {
      if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const results = await runRetentionJob();
      return NextResponse.json({ ok: true, results });
    }

    if (body.action === "seed_policies") {
      if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await ensureDefaultRetentionPolicies();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
