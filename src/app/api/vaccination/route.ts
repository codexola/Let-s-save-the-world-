import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  vaccinationDashboard,
  recordVaccination,
  issueCertificate,
  sendVaccinationReminders,
  VACCINE_CATALOG,
  ensureVaccinationSeed,
} from "@/lib/vaccination";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  const code = sp.get("code");

  if (action === "certificate" && code) {
    const cert = await prisma.vaccinationCertificate.findUnique({
      where: { publicCode: code.toUpperCase() },
      include: {
        record: true,
        user: { select: { name: true } },
      },
    });
    if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      certificate: {
        publicCode: cert.publicCode,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        patientName: cert.user.name,
        vaccine: cert.record.vaccineName,
        dose: `${cert.record.doseNumber}/${cert.record.totalDoses}`,
        administeredAt: cert.record.administeredAt,
        provider: cert.record.provider,
        lotNumber: cert.record.lotNumber,
      },
    });
  }

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (action === "catalog") {
    return NextResponse.json({ catalog: VACCINE_CATALOG });
  }

  const dash = await vaccinationDashboard(session.id);
  return NextResponse.json(dash);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "seed") {
      await ensureVaccinationSeed(session.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "record") {
      const record = await recordVaccination({
        userId: session.id,
        vaccineName: String(body.vaccineName),
        category: body.category ? String(body.category) : undefined,
        doseNumber: body.doseNumber != null ? Number(body.doseNumber) : undefined,
        totalDoses: body.totalDoses != null ? Number(body.totalDoses) : undefined,
        administeredAt: body.administeredAt ? new Date(body.administeredAt) : body.upcoming ? null : new Date(),
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        provider: body.provider ? String(body.provider) : undefined,
        lotNumber: body.lotNumber ? String(body.lotNumber) : undefined,
        site: body.site ? String(body.site) : undefined,
        campaignId: body.campaignId ? String(body.campaignId) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        familyMemberId: body.familyMemberId ? String(body.familyMemberId) : undefined,
      });
      return NextResponse.json({ record });
    }

    if (action === "certificate") {
      const cert = await issueCertificate(String(body.recordId), session.id);
      return NextResponse.json({ certificate: cert });
    }

    if (action === "reminders") {
      const sent = await sendVaccinationReminders(session.id);
      return NextResponse.json({ sent });
    }

    if (action === "create_campaign") {
      if (!["COMPANY", "ADMIN", "DEVELOPER", "HOSPITAL"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const campaign = await prisma.vaccinationCampaign.create({
        data: {
          ownerId: session.id,
          name: String(body.name),
          type: String(body.type || "corporate"),
          vaccineName: String(body.vaccineName),
          description: body.description ? String(body.description) : null,
          targetGroup: body.targetGroup ? String(body.targetGroup) : null,
          status: "active",
          startDate: new Date(),
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
      });
      await audit(session.id, "vaccination.campaign", "VaccinationCampaign", campaign.id);
      return NextResponse.json({ campaign });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
