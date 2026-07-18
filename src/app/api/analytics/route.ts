import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, requirePermission, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

function series(metrics: Array<{ recordedAt: Date; value: number }>) {
  return metrics.map((m) => ({
    at: m.recordedAt.toISOString(),
    value: m.value,
  }));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = req.nextUrl.searchParams.get("scope") || "auto";

  // Platform analytics — staff with ANALYTICS_VIEW or admin/developer
  if (scope === "platform" || (scope === "auto" && (session.role === "ADMIN" || session.role === "DEVELOPER"))) {
    try {
      await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
    } catch {
      if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [
      users,
      appointments,
      subscriptions,
      consultations,
      emergencies,
      featuresOn,
      platformReviews,
      blogPosts,
      prescriptions,
      invoicesOpen,
      telemedicineSessions,
      communityPosts,
      medicines,
      revenueAgg,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.appointment.count(),
      prisma.subscription.count({ where: { status: { in: ["ACTIVE", "ADMIN_GRANTED", "TRIAL"] } } }),
      prisma.aiConsultation.count(),
      prisma.emergencyRequest.count(),
      prisma.featureFlag.count({ where: { enabled: true } }),
      prisma.platformReview.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
      prisma.blogPost.count({ where: { published: true } }),
      prisma.prescription.count(),
      prisma.invoice.count({ where: { status: "OPEN" } }),
      prisma.telemedicineSession.count(),
      prisma.communityPost.count(),
      prisma.medicine.count(),
      prisma.invoice.aggregate({
        where: { status: { in: ["PAID", "PARTIAL_REFUND"] } },
        _sum: { amountYen: true },
      }),
    ]);

    return NextResponse.json({
      scope: "platform",
      stats: {
        users,
        appointments,
        activeSubscriptions: subscriptions,
        aiConsultations: consultations,
        emergencies,
        featuresEnabled: featuresOn,
        publishedBlogPosts: blogPosts,
        prescriptions,
        openInvoices: invoicesOpen,
        telemedicineSessions,
        communityPosts,
        medicinesListed: medicines,
        revenueYen: revenueAgg._sum.amountYen || 0,
      },
      platformReviews,
    });
  }

  // Patient health analytics
  if (scope === "patient" || (scope === "auto" && session.role === "PATIENT")) {
    const userId = req.nextUrl.searchParams.get("userId") || session.id;
    if (userId !== session.id && session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [appointments, invoices, prescriptions, metrics] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: userId },
        orderBy: { scheduledAt: "desc" },
        take: 50,
      }),
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.prescription.findMany({
        where: { patientId: userId },
        orderBy: { issuedAt: "desc" },
        take: 50,
      }),
      prisma.healthMetric.findMany({
        where: { userId },
        orderBy: { recordedAt: "asc" },
        take: 500,
      }),
    ]);

    const byType = (t: string) => series(metrics.filter((m) => m.type === t));
    const adherence = metrics.filter((m) => m.type === "medication_adherence");
    const adherenceAvg =
      adherence.length === 0
        ? null
        : Math.round((adherence.reduce((s, m) => s + m.value, 0) / adherence.length) * 10) / 10;

    const expensesYen = invoices.reduce((s, i) => s + (i.status === "PAID" || i.status === "OPEN" ? i.amountYen : 0), 0);

    return NextResponse.json({
      scope: "patient",
      patient: {
        appointments: {
          total: appointments.length,
          booked: appointments.filter((a) => a.status === "BOOKED").length,
          completed: appointments.filter((a) => a.status === "COMPLETED").length,
          cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
        },
        expensesYen,
        invoices: invoices.slice(0, 10),
        prescriptions: prescriptions.length,
        healthTrends: {
          weight: byType("weight"),
          bloodPressureSystolic: byType("bp_systolic"),
          bloodPressureDiastolic: byType("bp_diastolic"),
          bloodSugar: byType("blood_sugar"),
          exercise: byType("exercise_minutes"),
          sleep: byType("sleep_hours"),
          medicationAdherence: byType("medication_adherence"),
          medicationAdherenceAvg: adherenceAvg,
        },
      },
    });
  }

  // Hospital dashboard analytics
  if (scope === "hospital" || (scope === "auto" && session.role === "HOSPITAL")) {
    const profile = await prisma.hospitalProfile.findFirst({
      where: session.role === "HOSPITAL" ? { userId: session.id } : undefined,
    });
    const hospitalUserId = profile?.userId;
    const [appointments, invoices, doctors, reviews] = await Promise.all([
      prisma.appointment.findMany({
        where: hospitalUserId ? { hospitalId: hospitalUserId } : undefined,
        include: { doctor: { select: { id: true, name: true } } },
        take: 200,
      }),
      prisma.invoice.findMany({
        where: hospitalUserId
          ? { OR: [{ userId: hospitalUserId }, { corporate: false }], status: { in: ["PAID", "PARTIAL_REFUND"] } }
          : { status: { in: ["PAID", "PARTIAL_REFUND"] } },
        take: 200,
      }),
      prisma.doctorProfile.findMany({
        where: profile?.name
          ? { hospitalAffiliation: { contains: profile.name.split(" ")[0] || "" } }
          : undefined,
        include: { user: { select: { id: true, name: true } } },
        take: 50,
      }),
      prisma.review.findMany({
        where: hospitalUserId
          ? { OR: [{ targetId: hospitalUserId }, { targetType: "hospital" }] }
          : { targetType: "hospital" },
        take: 100,
      }),
    ]);

    const revenueYen = invoices.reduce((s, i) => s + i.amountYen, 0);
    const avgRating =
      reviews.length === 0
        ? null
        : Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;
    const booked = appointments.filter((a) => a.status === "BOOKED").length;
    const occupancyPct =
      profile && profile.totalBeds > 0
        ? Math.min(100, Math.round((booked / profile.totalBeds) * 100))
        : 0;

    const doctorLoad: Record<string, number> = {};
    for (const a of appointments) {
      if (a.doctorId) doctorLoad[a.doctor?.name || a.doctorId] = (doctorLoad[a.doctor?.name || a.doctorId] || 0) + 1;
    }

    return NextResponse.json({
      scope: "hospital",
      hospital: {
        revenueYen,
        appointments: {
          total: appointments.length,
          booked,
          completed: appointments.filter((a) => a.status === "COMPLETED").length,
        },
        ratings: { average: avgRating, count: reviews.length },
        doctors: {
          count: doctors.length,
          load: Object.entries(doctorLoad).map(([name, count]) => ({ name, appointments: count })),
        },
        occupancy: {
          totalBeds: profile?.totalBeds ?? 0,
          occupiedEstimate: booked,
          occupancyPct,
          icuBeds: profile?.icuBeds ?? 0,
          operatingRooms: profile?.operatingRooms ?? 0,
        },
      },
    });
  }

  // Corporate analytics
  if (scope === "corporate" || (scope === "auto" && session.role === "COMPANY")) {
    const profile = await prisma.companyProfile.findFirst({
      where: session.role === "COMPANY" ? { userId: session.id } : undefined,
    });
    if (!profile) {
      return NextResponse.json({ scope: "corporate", corporate: null });
    }
    const [employees, campaigns, sickLeaves, certificates] = await Promise.all([
      prisma.corporateEmployee.findMany({ where: { companyId: profile.id } }),
      prisma.corporateCampaign.findMany({ where: { companyId: profile.id } }),
      prisma.sickLeaveRecord.findMany({ where: { companyId: profile.id } }),
      prisma.medicalCertificate.findMany({ where: { companyId: profile.id } }),
    ]);
    const vaccinated = employees.filter((e) => e.vaccinatedAt).length;
    const checkedUp = employees.filter((e) => e.lastCheckupAt).length;
    const avgParticipation =
      campaigns.length === 0
        ? 0
        : Math.round(
            campaigns.reduce((s, c) => {
              const rate = c.targetCount > 0 ? (c.participation / c.targetCount) * 100 : c.participation;
              return s + rate;
            }, 0) / campaigns.length
          );

    return NextResponse.json({
      scope: "corporate",
      corporate: {
        participation: avgParticipation,
        healthStatistics: {
          employeeCount: employees.length || profile.employeeCount,
          vaccinationRate: employees.length ? Math.round((vaccinated / employees.length) * 100) : 0,
          checkupRate: employees.length ? Math.round((checkedUp / employees.length) * 100) : 0,
          openSickLeave: sickLeaves.filter((s) => s.status === "open").length,
          certificatesIssued: certificates.length,
        },
        campaigns: campaigns.map((c) => ({
          name: c.name,
          status: c.status,
          participation: c.participation,
          targetCount: c.targetCount,
        })),
        reports: profile.medicalReports,
      },
    });
  }

  return NextResponse.json({ error: "Unknown scope" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    if (body.action === "log_metric") {
      const metric = await prisma.healthMetric.create({
        data: {
          userId: session.id,
          type: String(body.type),
          value: Number(body.value),
          unit: body.unit ? String(body.unit) : null,
          note: body.note ? String(body.note) : null,
          recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
        },
      });
      return NextResponse.json({ metric });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
