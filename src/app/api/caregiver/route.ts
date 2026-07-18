import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  CAREGIVER_SERVICES,
  listCaregivers,
  bookCaregiver,
  payCaregiverBooking,
  ensureCaregiverSeed,
} from "@/lib/caregiver";

export async function GET() {
  try {
    const session = await requireSession();
    const caregivers = await listCaregivers();
    const bookings = await prisma.caregiverBooking.findMany({
      where: {
        OR: [{ patientId: session.id }, { caregiverId: session.id }],
      },
      include: {
        patient: { select: { id: true, name: true } },
        caregiverUser: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      services: CAREGIVER_SERVICES,
      caregivers,
      bookings,
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
    const action = body.action as string;

    if (action === "seed") {
      const result = await ensureCaregiverSeed();
      return NextResponse.json(result);
    }

    if (action === "book") {
      const booking = await bookCaregiver({
        patientId: session.id,
        caregiverUserId: String(body.caregiverUserId),
        service: String(body.service),
        scheduledAt: String(body.scheduledAt),
        hours: body.hours != null ? Number(body.hours) : 2,
        notes: body.notes ? String(body.notes) : undefined,
      });
      return NextResponse.json({ booking });
    }

    if (action === "pay") {
      const booking = await payCaregiverBooking(String(body.id), session.id);
      return NextResponse.json({ booking });
    }

    if (action === "review") {
      const profile = await prisma.caregiverProfile.findUnique({
        where: { userId: String(body.caregiverUserId) },
      });
      if (!profile) return NextResponse.json({ error: "Caregiver not found" }, { status: 404 });
      const review = await prisma.caregiverReview.create({
        data: {
          caregiverId: profile.id,
          authorId: session.id,
          rating: Number(body.rating) || 5,
          body: body.body ? String(body.body) : null,
        },
      });
      const agg = await prisma.caregiverReview.aggregate({
        where: { caregiverId: profile.id },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.caregiverProfile.update({
        where: { id: profile.id },
        data: {
          ratingAvg: agg._avg.rating || 5,
          reviewCount: agg._count,
        },
      });
      await audit(session.id, "caregiver.review", "CaregiverReview", review.id);
      return NextResponse.json({ review });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
