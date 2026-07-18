import { NextRequest, NextResponse } from "next/server";
import { SubscriptionPlan } from "@prisma/client";
import { getSession, requirePermission, requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS, SUBSCRIPTION_PLANS } from "@/lib/permissions";
import {
  purchaseSubscription,
  adminGrantSubscription,
  reconcileSubscriptionPayment,
  renewSubscription,
  cancelSubscription,
} from "@/lib/subscriptions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isStaff = session.role === "ADMIN" || session.role === "DEVELOPER";
  const subscriptions = await prisma.subscription.findMany({
    where: isStaff ? undefined : { userId: session.id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      registrationCode: true,
      paymentHistory: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (isStaff) {
    for (const s of subscriptions) {
      await reconcileSubscriptionPayment(s.id);
    }
  }

  const invoices = await prisma.invoice.findMany({
    where: { userId: session.id, description: { contains: "Subscription" } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    subscriptions,
    invoices,
    plans: Object.values(SUBSCRIPTION_PLANS),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "purchase") {
      const session = await getSession();
      const result = await purchaseSubscription({
        email: body.email || session?.email,
        plan: body.plan as SubscriptionPlan,
        userId: body.userId || session?.id,
        name: body.name || session?.name,
        paymentMethod: body.paymentMethod || "card",
        employeeCount: body.employeeCount,
        trial: Boolean(body.trial),
        couponCode: body.couponCode,
      });
      return NextResponse.json({
        ok: true,
        subscriptionId: result.subscription.id,
        code: result.code,
        priceYen: result.priceYen,
        trial: result.trial,
        message: result.trial
          ? "14-day free trial started. Registration code sent to email inbox."
          : "Payment received. Registration code sent to email inbox.",
      });
    }

    if (action === "renew") {
      const session = await requireSession();
      const updated = await renewSubscription(String(body.subscriptionId), session.id);
      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "cancel") {
      const session = await requireSession();
      const updated = await cancelSubscription(String(body.subscriptionId), session.id);
      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "admin_grant") {
      const session = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_OVERRIDE);
      const updated = await adminGrantSubscription({
        subscriptionId: body.subscriptionId,
        adminId: session.id,
      });
      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "reconcile") {
      await requirePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE);
      const updated = await reconcileSubscriptionPayment(body.subscriptionId);
      return NextResponse.json({ ok: true, subscription: updated });
    }

    if (action === "create_pending") {
      const session = await requirePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      const plan = body.plan as SubscriptionPlan;
      const planMeta = Object.values(SUBSCRIPTION_PLANS).find((p) => p.plan === plan);
      const employees = Math.max(1, Number(body.employeeCount) || 1);
      const priceYen = planMeta
        ? planMeta.perEmployee
          ? planMeta.priceYen * employees
          : planMeta.priceYen
        : 1000;
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          plan,
          status: "PENDING",
          priceYen,
          paid: false,
        },
      });
      await audit(session.id, "subscription.create_pending", "Subscription", sub.id);
      return NextResponse.json({ subscription: sub });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
