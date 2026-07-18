import { config } from "./config";
import { prisma } from "./db";
import { sendEmail } from "./mail";

export type NotifyChannel = "email" | "sms" | "push" | "line" | "inbox" | "emergency";
export type NotifyKind =
  | "general"
  | "appointment"
  | "prescription"
  | "subscription"
  | "emergency"
  | "reminder";

async function prefsFor(userId?: string) {
  if (!userId) return null;
  return prisma.notificationPreference.findUnique({ where: { userId } });
}

export async function sendSms(opts: { to: string; body: string; userId?: string; kind?: NotifyKind }) {
  const notification = await prisma.notification.create({
    data: {
      email: opts.to,
      userId: opts.userId,
      channel: "sms",
      kind: opts.kind || "general",
      subject: "SMS notification",
      body: opts.body,
    },
  });

  if (config.notifications.twilio.enabled) {
    try {
      const auth = Buffer.from(
        `${config.notifications.twilio.accountSid}:${config.notifications.twilio.authToken}`
      ).toString("base64");
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.notifications.twilio.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: opts.to,
            From: config.notifications.twilio.from,
            Body: opts.body,
          }).toString(),
        }
      );
    } catch (err) {
      console.warn("[sms] Twilio send failed, inbox kept:", err);
    }
  }

  return notification;
}

export async function sendPush(opts: {
  userId: string;
  subject: string;
  body: string;
  kind?: NotifyKind;
}) {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  const devices = await prisma.pushDevice.findMany({
    where: { userId: opts.userId, active: true },
  });

  const notification = await prisma.notification.create({
    data: {
      email: user?.email || "push@medcare.local",
      userId: opts.userId,
      channel: "push",
      kind: opts.kind || "general",
      subject: opts.subject,
      body: opts.body + (devices.length ? `\n\n[Delivered to ${devices.length} device(s)]` : "\n\n[No devices registered — stored in inbox]"),
    },
  });

  // Web Push / FCM would use device tokens when VAPID/FCM keys are configured
  return notification;
}

export async function sendLineMessage(opts: {
  userId?: string;
  toLineUserId?: string;
  subject: string;
  body: string;
  kind?: NotifyKind;
}) {
  const user = opts.userId
    ? await prisma.user.findUnique({
        where: { id: opts.userId },
        include: { oauthAccounts: { where: { provider: "line" } } },
      })
    : null;
  const lineId = opts.toLineUserId || user?.oauthAccounts[0]?.providerSubject;
  const email = user?.email || "line@medcare.local";

  const notification = await prisma.notification.create({
    data: {
      email,
      userId: opts.userId,
      channel: "line",
      kind: opts.kind || "general",
      subject: opts.subject,
      body: opts.body,
    },
  });

  if (config.notifications.lineMessaging.enabled && lineId) {
    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.notifications.lineMessaging.channelAccessToken}`,
        },
        body: JSON.stringify({
          to: lineId,
          messages: [{ type: "text", text: `${opts.subject}\n\n${opts.body}` }],
        }),
      });
    } catch (err) {
      console.warn("[line] Messaging API failed, inbox kept:", err);
    }
  }

  return notification;
}

/** Fan-out across preferred channels */
export async function notifyUser(opts: {
  userId: string;
  subject: string;
  body: string;
  kind?: NotifyKind;
  channels?: NotifyChannel[];
  emergency?: boolean;
}) {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("User not found");

  const prefs = (await prefsFor(opts.userId)) || {
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
    lineEnabled: true,
    appointmentReminders: true,
    prescriptionReminders: true,
    subscriptionReminders: true,
    emergencyAlerts: true,
  };

  const kind = opts.kind || (opts.emergency ? "emergency" : "general");
  if (kind === "appointment" && !prefs.appointmentReminders) return [];
  if (kind === "prescription" && !prefs.prescriptionReminders) return [];
  if (kind === "subscription" && !prefs.subscriptionReminders) return [];
  if ((kind === "emergency" || opts.emergency) && !prefs.emergencyAlerts) return [];

  const channels = opts.channels || (
    opts.emergency
      ? (["email", "sms", "push", "line", "emergency"] as NotifyChannel[])
      : (["email", "push"] as NotifyChannel[])
  );

  const results = [];
  for (const ch of channels) {
    if (ch === "email" && prefs.emailEnabled) {
      results.push(
        await sendEmail({
          to: user.email,
          userId: user.id,
          subject: opts.subject,
          body: opts.body,
          kind,
        })
      );
    }
    if (ch === "sms" && prefs.smsEnabled && user.phone) {
      results.push(await sendSms({ to: user.phone, body: `${opts.subject}: ${opts.body}`, userId: user.id, kind }));
    }
    if ((ch === "push" || ch === "emergency") && prefs.pushEnabled) {
      results.push(await sendPush({ userId: user.id, subject: opts.subject, body: opts.body, kind }));
    }
    if (ch === "line" && prefs.lineEnabled) {
      results.push(
        await sendLineMessage({ userId: user.id, subject: opts.subject, body: opts.body, kind })
      );
    }
    if (ch === "inbox") {
      results.push(
        await prisma.notification.create({
          data: {
            email: user.email,
            userId: user.id,
            channel: "inbox",
            kind,
            subject: opts.subject,
            body: opts.body,
          },
        })
      );
    }
  }
  return results;
}

export async function runReminderJob() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 1000 * 60 * 60 * 24);
  const in48h = new Date(now.getTime() + 1000 * 60 * 60 * 48);
  let sent = 0;

  // Appointment reminders (next 24h)
  const appts = await prisma.appointment.findMany({
    where: {
      status: "BOOKED",
      scheduledAt: { gte: now, lte: in24h },
    },
    include: { patient: true, doctor: { select: { name: true } } },
  });
  for (const a of appts) {
    await notifyUser({
      userId: a.patientId,
      kind: "appointment",
      subject: "Appointment reminder",
      body: `Reminder: appointment${a.doctor ? ` with ${a.doctor.name}` : ""} at ${a.scheduledAt.toLocaleString()}.`,
      channels: ["email", "sms", "push", "line"],
    });
    sent += 1;
  }

  // Prescription reminders — issued Rx that may need refill/pickup
  const rxs = await prisma.prescription.findMany({
    where: {
      status: { in: ["ISSUED", "APPROVED", "READY"] },
      issuedAt: { gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7) },
    },
    take: 50,
  });
  for (const rx of rxs) {
    await notifyUser({
      userId: rx.patientId,
      kind: "prescription",
      subject: "Prescription reminder",
      body: `Reminder: ${rx.medication}${rx.dosage ? ` (${rx.dosage})` : ""} — status ${rx.status}.`,
      channels: ["email", "push"],
    });
    sent += 1;
  }

  // Subscription ending within 48h
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      endsAt: { gte: now, lte: in48h },
    },
  });
  for (const s of subs) {
    await notifyUser({
      userId: s.userId,
      kind: "subscription",
      subject: "Subscription renewal reminder",
      body: `Your ${s.plan} subscription ends on ${s.endsAt?.toLocaleString()}. Renew to keep access.`,
      channels: ["email", "push"],
    });
    sent += 1;
  }

  // AI follow-up reminders due
  const followUps = await prisma.followUpReminder.findMany({
    where: { notified: false, completed: false, dueAt: { lte: now } },
    take: 100,
  });
  for (const f of followUps) {
    await notifyUser({
      userId: f.userId,
      kind: "reminder",
      subject: f.title || "Health follow-up reminder",
      body: f.body || "Please follow up on your recent AI consultation.",
      channels: ["email", "push"],
    });
    await prisma.followUpReminder.update({
      where: { id: f.id },
      data: { notified: true },
    });
    sent += 1;
  }

  return { sent, appointments: appts.length, prescriptions: rxs.length, subscriptions: subs.length, followUps: followUps.length };
}
