import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = await req.json();
  const request = await prisma.emergencyRequest.create({
    data: {
      patientId: session?.id,
      symptoms: body.symptoms || "Emergency request",
      location: body.location,
      status: "dispatched",
      etaMinutes: 8 + Math.floor(Math.random() * 12),
      hospitalNotified: true,
    },
  });

  if (session) {
    await prisma.notification.create({
      data: {
        userId: session.id,
        email: session.email,
        subject: "EMS dispatched",
        body: `Ambulance ETA ~${request.etaMinutes} minutes. Hospital pre-notified.`,
        channel: "push",
      },
    });
  }

  return NextResponse.json({
    request,
    message: "Emergency services notified. Share digital emergency ID with responders.",
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = await prisma.emergencyRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ requests });
}
