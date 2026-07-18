import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDatabaseBackup, listBackups, zeroTrustStatus, recordSecurityEvent } from "@/lib/security-ops";
import { encryptField, decryptField } from "@/lib/crypto-field";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isStaff = session.role === "ADMIN" || session.role === "DEVELOPER";
  const zeroTrust = zeroTrustStatus();
  const backups = isStaff ? await listBackups() : [];
  const events = isStaff
    ? await prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 })
    : [];

  return NextResponse.json({
    zeroTrust,
    backups,
    events,
    encryptionDemo: {
      algorithm: "AES-256-GCM",
      sample: "Use action encrypt_demo to test field encryption",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    if (body.action === "encrypt_demo") {
      const plaintext = String(body.text || "sensitive-patient-data");
      const encrypted = encryptField(plaintext);
      const roundtrip = decryptField(encrypted);
      await recordSecurityEvent({
        type: "encryption_demo",
        severity: "info",
        userId: session.id,
        details: "AES-256-GCM field encryption exercised",
      });
      return NextResponse.json({ encrypted, roundtrip, matches: plaintext === roundtrip });
    }

    if (body.action === "create_backup") {
      if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const result = await createDatabaseBackup(session.id);
      return NextResponse.json({ backup: result.record });
    }

    if (body.action === "report_intrusion") {
      const event = await recordSecurityEvent({
        type: String(body.type || "suspicious_activity"),
        severity: String(body.severity || "warning"),
        userId: session.id,
        path: body.path || null,
        ip: body.ip || null,
        details: body.details || null,
      });
      await audit(session.id, "security.intrusion_report", "SecurityEvent", event.id);
      return NextResponse.json({ event });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
