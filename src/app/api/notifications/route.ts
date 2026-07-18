import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyUser, runReminderJob } from "@/lib/notify";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const email = req.nextUrl.searchParams.get("email") || session?.email;
  if (!email && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isStaff = session?.role === "ADMIN" || session?.role === "DEVELOPER";
  const channel = req.nextUrl.searchParams.get("channel");
  const kind = req.nextUrl.searchParams.get("kind");

  const notifications = await prisma.notification.findMany({
    where: {
      ...(isStaff && !req.nextUrl.searchParams.get("email")
        ? {}
        : { email: email || undefined }),
      ...(channel ? { channel } : {}),
      ...(kind ? { kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const prefs = session
    ? await prisma.notificationPreference.findUnique({ where: { userId: session.id } })
    : null;

  const devices = session
    ? await prisma.pushDevice.findMany({ where: { userId: session.id, active: true } })
    : [];

  return NextResponse.json({
    notifications,
    preferences: prefs,
    devices,
    channels: ["email", "sms", "push", "line", "inbox", "emergency"],
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "mark_read") {
    await prisma.notification.update({
      where: { id: body.id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_all_read") {
    await prisma.notification.updateMany({
      where: { email: session.email, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save_preferences") {
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: session.id },
      update: {
        emailEnabled: Boolean(body.emailEnabled ?? true),
        smsEnabled: Boolean(body.smsEnabled ?? true),
        pushEnabled: Boolean(body.pushEnabled ?? true),
        lineEnabled: Boolean(body.lineEnabled ?? true),
        appointmentReminders: Boolean(body.appointmentReminders ?? true),
        prescriptionReminders: Boolean(body.prescriptionReminders ?? true),
        subscriptionReminders: Boolean(body.subscriptionReminders ?? true),
        emergencyAlerts: Boolean(body.emergencyAlerts ?? true),
      },
      create: {
        userId: session.id,
        emailEnabled: Boolean(body.emailEnabled ?? true),
        smsEnabled: Boolean(body.smsEnabled ?? true),
        pushEnabled: Boolean(body.pushEnabled ?? true),
        lineEnabled: Boolean(body.lineEnabled ?? true),
        appointmentReminders: Boolean(body.appointmentReminders ?? true),
        prescriptionReminders: Boolean(body.prescriptionReminders ?? true),
        subscriptionReminders: Boolean(body.subscriptionReminders ?? true),
        emergencyAlerts: Boolean(body.emergencyAlerts ?? true),
      },
    });
    return NextResponse.json({ preferences: prefs });
  }

  if (body.action === "register_push") {
    const device = await prisma.pushDevice.upsert({
      where: {
        userId_token: { userId: session.id, token: String(body.token) },
      },
      update: { active: true, platform: String(body.platform || "web") },
      create: {
        userId: session.id,
        token: String(body.token),
        platform: String(body.platform || "web"),
      },
    });
    return NextResponse.json({ device });
  }

  if (body.action === "send_test") {
    await notifyUser({
      userId: session.id,
      subject: "MedCare notification test",
      body: `Test via ${body.channel || "all channels"} at ${new Date().toISOString()}`,
      kind: "general",
      channels: body.channel ? [body.channel] : ["email", "sms", "push", "line"],
    });
    return NextResponse.json({ ok: true, message: "Test notification sent" });
  }

  if (body.action === "emergency_broadcast") {
    if (session.role !== "ADMIN" && session.role !== "DEVELOPER" && session.role !== "HOSPITAL") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const users = await prisma.user.findMany({
      where: { active: true, role: "PATIENT" },
      take: 100,
    });
    for (const u of users) {
      await notifyUser({
        userId: u.id,
        subject: String(body.subject || "Emergency alert"),
        body: String(body.body || "Emergency notification from MedCare"),
        kind: "emergency",
        emergency: true,
      });
    }
    await audit(session.id, "notification.emergency", "Notification", String(users.length));
    return NextResponse.json({ ok: true, sent: users.length });
  }

  if (body.action === "run_reminders") {
    if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await runReminderJob();
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
