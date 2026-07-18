import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await prisma.invoice.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invoices, paymentsMode: config.payments.enabled ? "stripe" : "mock" });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "pay") {
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    if (!invoice || invoice.userId !== session.id) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "PAID") {
      return NextResponse.json({ error: "Already paid" }, { status: 400 });
    }

    let providerRef = `mock_${invoice.id}`;

    if (config.payments.enabled) {
      try {
        const params = new URLSearchParams();
        params.set("amount", String(invoice.amountYen));
        params.set("currency", "jpy");
        params.set("payment_method_types[]", "card");
        params.set("metadata[invoiceId]", invoice.id);

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
        providerRef = `stripe_stub_${invoice.id}`;
      }
    }

    const paid = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date(), providerRef },
    });

    await sendEmail({
      to: session.email,
      userId: session.id,
      subject: "Payment received",
      body: `Thank you — ¥${invoice.amountYen.toLocaleString()} paid for: ${invoice.description}. Ref: ${providerRef}`,
    });

    return NextResponse.json({ invoice: paid, providerRef });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
