import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import {
  globalDashboard,
  setUserRegion,
  convertCurrency,
  computeLocalTax,
  ensureGlobalSeed,
} from "@/lib/global-platform";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireSession();
    const dash = await globalDashboard(session.id);
    return NextResponse.json(dash);
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
      await ensureGlobalSeed();
      return NextResponse.json({ ok: true });
    }

    if (action === "set_region") {
      const preferences = await setUserRegion(session.id, {
        locale: body.locale ? String(body.locale) : undefined,
        countryCode: body.countryCode ? String(body.countryCode) : undefined,
        timezone: body.timezone ? String(body.timezone) : undefined,
        currency: body.currency ? String(body.currency) : undefined,
      });
      await audit(session.id, "global.set_region", "User");
      return NextResponse.json({ preferences });
    }

    if (action === "convert") {
      const result = await convertCurrency(
        Number(body.amount),
        String(body.fromCode || "JPY"),
        String(body.toCode || "USD")
      );
      return NextResponse.json(result);
    }

    if (action === "tax") {
      const country = await prisma.countryConfig.findUnique({
        where: { code: String(body.countryCode || "JP") },
      });
      if (!country) return NextResponse.json({ error: "Country not found" }, { status: 404 });
      return NextResponse.json({
        country: country.code,
        ...computeLocalTax(Number(body.amountYen || 0), country.taxRateBps),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
