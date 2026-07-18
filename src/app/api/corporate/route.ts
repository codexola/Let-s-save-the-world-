import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "COMPANY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await prisma.companyProfile.findFirst({
    where: session.role === "COMPANY" ? { userId: session.id } : undefined,
  });

  const campaigns = [
    { id: "flu-2026", name: "Influenza vaccination drive", participation: 68, status: "active" },
    { id: "checkup-q2", name: "Q2 health checkups", participation: 42, status: "planned" },
  ];

  return NextResponse.json({
    profile,
    employeeCount: profile?.employeeCount ?? 0,
    campaigns,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "COMPANY" && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (body.action === "vaccination_reminder") {
    const message = String(body.message || "Annual flu vaccination reminder from your employer.");
    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Vaccination reminder sent",
      body: `${message}\n\n(Campaign broadcast logged for ${body.campaignId || "default"}.)`,
    });
    return NextResponse.json({ ok: true, message: "Reminder notification created" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
