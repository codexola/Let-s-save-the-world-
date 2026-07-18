import { NextRequest, NextResponse } from "next/server";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

const PAYMENT_METHODS = [
  "card",
  "apple_pay",
  "google_pay",
  "bank_transfer",
  "corporate",
] as const;

async function applyCoupon(code: string | undefined, amount: number, ambassador = false) {
  if (!code) return { discountYen: 0, code: null as string | null };
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon || !coupon.active) throw new Error("Invalid coupon");
  if (coupon.ambassadorOnly && !ambassador) throw new Error("Ambassador coupon only");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error("Coupon expired");
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new Error("Coupon exhausted");
  let discountYen = coupon.discountYen;
  if (coupon.discountPercent > 0) discountYen += Math.floor((amount * coupon.discountPercent) / 100);
  await prisma.coupon.update({
    where: { id: coupon.id },
    data: { usedCount: { increment: 1 } },
  });
  return { discountYen: Math.min(discountYen, amount), code: coupon.code };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    where:
      session.role === "ADMIN" || session.role === "DEVELOPER" || session.role === "COMPANY"
        ? session.role === "COMPANY"
          ? { OR: [{ userId: session.id }, { corporate: true }] }
          : undefined
        : { userId: session.id },
    orderBy: { createdAt: "desc" },
  });

  const coupons = await prisma.coupon.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    invoices,
    coupons: coupons.map((c) => ({
      code: c.code,
      description: c.description,
      discountPercent: c.discountPercent,
      discountYen: c.discountYen,
      ambassadorOnly: c.ambassadorOnly,
    })),
    paymentMethods: PAYMENT_METHODS,
    paymentsMode: config.payments.enabled ? "stripe" : "mock",
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "create_invoice") {
    const amountYen = Math.max(0, Number(body.amountYen) || 0);
    const invoice = await prisma.invoice.create({
      data: {
        userId: body.userId ? String(body.userId) : session.id,
        amountYen,
        description: String(body.description || "MedCare invoice"),
        corporate: Boolean(body.corporate),
        status: "OPEN",
      },
    });
    await audit(session.id, "billing.create_invoice", "Invoice", invoice.id);
    return NextResponse.json({ invoice });
  }

  if (body.action === "corporate_bill") {
    if (session.role !== "COMPANY" && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const company = await prisma.companyProfile.findUnique({ where: { userId: session.id } });
    const employees = company?.employeeCount || Number(body.employeeCount) || 1;
    const perEmployee = Number(body.perEmployeeYen) || 400;
    const amountYen = employees * perEmployee;
    const invoice = await prisma.invoice.create({
      data: {
        userId: session.id,
        amountYen,
        description: `Corporate billing: ${employees} employees × ¥${perEmployee}`,
        corporate: true,
        status: "OPEN",
      },
    });
    return NextResponse.json({ invoice });
  }

  if (body.action === "pay") {
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice || (invoice.userId !== session.id && session.role !== "ADMIN")) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "PAID") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    const method = String(body.paymentMethod || "card");
    if (!PAYMENT_METHODS.includes(method as (typeof PAYMENT_METHODS)[number])) {
      return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
    }

    let discountYen = 0;
    let couponCode: string | null = null;
    try {
      const applied = await applyCoupon(body.couponCode, invoice.amountYen, Boolean(body.ambassador));
      discountYen = applied.discountYen;
      couponCode = applied.code;
    } catch (e) {
      if (body.couponCode) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Coupon error" }, { status: 400 });
      }
    }

    const chargeYen = Math.max(0, invoice.amountYen - discountYen - (invoice.discountYen || 0));
    let providerRef = `mock_${method}_${invoice.id}`;

    if (config.payments.enabled && (method === "card" || method === "apple_pay" || method === "google_pay")) {
      try {
        const params = new URLSearchParams();
        params.set("amount", String(chargeYen));
        params.set("currency", "jpy");
        if (method === "card") params.set("payment_method_types[]", "card");
        if (method === "apple_pay" || method === "google_pay") {
          params.set("payment_method_types[]", "card");
          params.set("payment_method_options[card][request_three_d_secure]", "automatic");
        }
        params.set("metadata[invoiceId]", invoice.id);
        params.set("metadata[method]", method);

        const res = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.payments.stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        if (res.ok) {
          const intent = (await res.json()) as { id?: string };
          providerRef = intent.id || providerRef;
        }
      } catch {
        providerRef = `stripe_stub_${method}_${invoice.id}`;
      }
    }

    if (method === "bank_transfer") {
      providerRef = `bank_pending_${invoice.id}`;
    }

    const paid = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: method === "bank_transfer" ? "PENDING_TRANSFER" : "PAID",
        paidAt: method === "bank_transfer" ? null : new Date(),
        providerRef,
        paymentMethod: method,
        couponCode,
        discountYen: (invoice.discountYen || 0) + discountYen,
        amountYen: chargeYen,
      },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: method === "bank_transfer" ? "Bank transfer instructions" : "Payment received",
      body:
        method === "bank_transfer"
          ? `Please transfer ¥${chargeYen.toLocaleString()} to MedCare Trust (ref ${providerRef}). Invoice: ${invoice.description}`
          : `Thank you — ¥${chargeYen.toLocaleString()} paid via ${method} for: ${invoice.description}. Ref: ${providerRef}`,
    });

    return NextResponse.json({ invoice: paid, providerRef, method });
  }

  if (body.action === "refund") {
    if (session.role !== "ADMIN" && session.role !== "DEVELOPER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice || invoice.status !== "PAID") {
      return NextResponse.json({ error: "Only paid invoices can be refunded" }, { status: 400 });
    }
    const refundYen = Math.min(
      Number(body.amountYen) || invoice.amountYen,
      invoice.amountYen - (invoice.refundedYen || 0)
    );
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        refundedYen: (invoice.refundedYen || 0) + refundYen,
        refundedAt: new Date(),
        status: refundYen >= invoice.amountYen ? "REFUNDED" : "PARTIAL_REFUND",
      },
    });
    await audit(session.id, "billing.refund", "Invoice", `${invoice.id}:${refundYen}`);
    return NextResponse.json({ invoice: updated });
  }

  if (body.action === "create_coupon") {
    await requirePermission(PERMISSIONS.COUPONS_MANAGE);
    const coupon = await prisma.coupon.create({
      data: {
        code: String(body.code).toUpperCase(),
        description: body.description || null,
        discountPercent: Number(body.discountPercent) || 0,
        discountYen: Number(body.discountYen) || 0,
        ambassadorOnly: Boolean(body.ambassadorOnly),
        maxUses: body.maxUses != null ? Number(body.maxUses) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    return NextResponse.json({ coupon });
  }

  if (body.action === "support") {
    const subject = String(body.subject || "Payment support request");
    const details = String(body.message || "");
    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: `[MedCare Support] ${subject}`,
      body: `Payment support ticket received.\n\nFrom: ${session.name} <${session.email}>\nInvoice: ${body.invoiceId || "n/a"}\n\n${details}\n\nOur billing team will follow up within 1 business day.`,
    });
    await audit(session.id, "billing.support", "Invoice", String(body.invoiceId || "general"));
    return NextResponse.json({ ok: true, message: "Support request logged — check Notifications" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
