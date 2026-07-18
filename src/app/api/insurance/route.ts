import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  insuranceDashboard,
  verifyInsurance,
  coverageCheck,
  submitClaim,
  trackAndAdvanceClaim,
  requestPreAuth,
  estimateCosts,
  ensureInsurancePolicy,
} from "@/lib/insurance";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  const code = sp.get("code");

  if (action === "card" && code) {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { cardCode: code.toUpperCase() },
      include: { user: { select: { name: true } } },
    });
    if (!policy || !policy.active) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      card: {
        cardCode: policy.cardCode,
        memberId: policy.memberId,
        insurerName: policy.insurerName,
        planName: policy.planName,
        patientName: policy.user.name,
        verified: policy.verified,
        groupNumber: policy.groupNumber,
      },
    });
  }

  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dash = await insuranceDashboard(session.id);
  return NextResponse.json(dash);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "verify") {
      const policy = await verifyInsurance(session.id);
      return NextResponse.json({ policy });
    }

    if (action === "coverage") {
      const result = await coverageCheck(session.id, String(body.service || "outpatient"));
      return NextResponse.json(result);
    }

    if (action === "estimate") {
      const policy = await ensureInsurancePolicy(session.id);
      const estimate = estimateCosts(policy, Number(body.amountYen) || 0);
      return NextResponse.json({ estimate, policy });
    }

    if (action === "submit_claim") {
      const result = await submitClaim({
        userId: session.id,
        serviceDesc: String(body.serviceDesc),
        amountYen: Number(body.amountYen),
      });
      return NextResponse.json(result);
    }

    if (action === "track" || action === "advance_claim") {
      const claim = await trackAndAdvanceClaim(
        String(body.id),
        session.id,
        String(body.status || "approved")
      );
      return NextResponse.json({ claim });
    }

    if (action === "preauth") {
      const preAuth = await requestPreAuth({
        userId: session.id,
        serviceDesc: String(body.serviceDesc),
        amountYen: Number(body.amountYen) || 0,
      });
      return NextResponse.json({ preAuth });
    }

    if (action === "mark_reimbursed") {
      const claim = await trackAndAdvanceClaim(String(body.id), session.id, "paid");
      return NextResponse.json({ claim });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
