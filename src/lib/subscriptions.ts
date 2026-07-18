import { randomBytes } from "crypto";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";
import { sendEmail, subscriptionCodeEmail } from "./mail";
import { SUBSCRIPTION_PLANS } from "./permissions";
import { audit } from "./auth";

export function generateRegistrationCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function purchaseSubscription(opts: {
  email: string;
  plan: SubscriptionPlan;
  userId?: string;
  name?: string;
  paymentMethod?: string;
}) {
  const planMeta = Object.values(SUBSCRIPTION_PLANS).find((p) => p.plan === opts.plan);
  if (!planMeta) throw new Error("Invalid plan");

  const code = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  const subscription = await prisma.subscription.create({
    data: {
      userId: opts.userId || (await ensurePlaceholderUser(opts.email, opts.name)).id,
      plan: opts.plan,
      status: SubscriptionStatus.PENDING,
      priceYen: planMeta.priceYen,
      paid: true,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      paymentRef: `pay_${Date.now()}`,
      paymentHistory: {
        create: {
          amountYen: planMeta.priceYen,
          method: opts.paymentMethod || "card",
          status: "paid",
          paidAt: new Date(),
        },
      },
      registrationCode: {
        create: {
          code,
          email: opts.email,
          ownerId: opts.userId,
          expiresAt,
        },
      },
    },
    include: { registrationCode: true },
  });

  await reconcileSubscriptionPayment(subscription.id);

  const mail = subscriptionCodeEmail({
    name: opts.name,
    code,
    plan: planMeta.label,
    priceYen: planMeta.priceYen,
  });

  await sendEmail({
    to: opts.email,
    subject: mail.subject,
    body: mail.body,
    userId: opts.userId,
  });

  await audit(opts.userId, "subscription.purchase", "Subscription", subscription.id);

  return { subscription, code };
}

export async function reconcileSubscriptionPayment(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { paymentHistory: true },
  });
  if (!sub) return null;

  const hasPaid =
    sub.paymentHistory.some((p) => p.status === "paid") || sub.paid || sub.adminGranted;
  if (
    hasPaid &&
    sub.status !== SubscriptionStatus.ACTIVE &&
    sub.status !== SubscriptionStatus.ADMIN_GRANTED
  ) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paid: true,
        status: sub.adminGranted
          ? SubscriptionStatus.ADMIN_GRANTED
          : SubscriptionStatus.ACTIVE,
      },
    });
  }
  return sub;
}

export async function adminGrantSubscription(opts: {
  subscriptionId: string;
  adminId: string;
}) {
  const updated = await prisma.subscription.update({
    where: { id: opts.subscriptionId },
    data: {
      adminGranted: true,
      paid: false,
      status: SubscriptionStatus.ADMIN_GRANTED,
      grantedById: opts.adminId,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
    include: { registrationCode: true, user: true },
  });

  if (!updated.registrationCode) {
    const code = generateRegistrationCode();
    await prisma.registrationCode.create({
      data: {
        code,
        email: updated.user.email,
        subscriptionId: updated.id,
        ownerId: opts.adminId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      },
    });
    const mail = subscriptionCodeEmail({
      name: updated.user.name,
      code,
      plan: updated.plan,
      priceYen: 0,
    });
    await sendEmail({
      to: updated.user.email,
      subject: `[MedCare] Admin-granted access — ${updated.plan}`,
      body: mail.body + "\n\n(This subscription was activated by an administrator without payment.)",
      userId: updated.userId,
    });
  }

  await audit(opts.adminId, "subscription.admin_grant", "Subscription", opts.subscriptionId);
  return updated;
}

export async function redeemRegistrationCode(opts: {
  code: string;
  userId: string;
  email: string;
}) {
  const record = await prisma.registrationCode.findUnique({
    where: { code: opts.code.toUpperCase() },
    include: { subscription: true },
  });
  if (!record || record.used) throw new Error("Invalid or used code");
  if (record.expiresAt < new Date()) throw new Error("Code expired");
  if (record.email.toLowerCase() !== opts.email.toLowerCase()) {
    throw new Error("Code email does not match registration email");
  }

  await prisma.registrationCode.update({
    where: { id: record.id },
    data: { used: true, usedById: opts.userId },
  });

  if (record.subscriptionId) {
    await prisma.subscription.update({
      where: { id: record.subscriptionId },
      data: {
        userId: opts.userId,
        status: record.subscription?.adminGranted
          ? SubscriptionStatus.ADMIN_GRANTED
          : SubscriptionStatus.ACTIVE,
      },
    });
    await reconcileSubscriptionPayment(record.subscriptionId);
  }

  await audit(opts.userId, "registration.code_redeem", "RegistrationCode", record.id);
  return record;
}

async function ensurePlaceholderUser(email: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const bcrypt = await import("bcryptjs");
  return prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      passwordHash: await bcrypt.hash(randomBytes(16).toString("hex"), 10),
      role: "PATIENT",
      active: false,
      verified: false,
    },
  });
}
