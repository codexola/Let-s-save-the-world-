import { NextRequest, NextResponse } from "next/server";
import {
  authenticateApiKey,
  checkPartnerRateLimit,
  handleV1Resource,
  logApiUsage,
} from "@/lib/api-platform";

type Ctx = { params: Promise<{ resource: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  return handle(req, context, "GET");
}

export async function POST(req: NextRequest, context: Ctx) {
  return handle(req, context, "POST");
}

async function handle(req: NextRequest, context: Ctx, method: string) {
  const { resource } = await context.params;
  let statusCode = 200;
  let appId = "";
  let sandbox = true;
  try {
    const partner = await authenticateApiKey(req.headers.get("authorization"));
    appId = partner.appId;
    sandbox = partner.sandbox;
    const rl = checkPartnerRateLimit(partner);
    if (!rl.ok) {
      statusCode = 429;
      await logApiUsage({
        appId: partner.appId,
        resource,
        method,
        statusCode,
        sandbox: partner.sandbox,
      });
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(partner.rateLimit),
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
          },
        }
      );
    }
    const patientId = req.nextUrl.searchParams.get("patientId") || undefined;
    const data = await handleV1Resource({ resource, method, ctx: partner, patientId });
    await logApiUsage({
      appId: partner.appId,
      userId: partner.ownerId,
      resource,
      method,
      statusCode: 200,
      sandbox: partner.sandbox,
    });
    return NextResponse.json(data, {
      headers: {
        "X-RateLimit-Limit": String(partner.rateLimit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-MedCare-Sandbox": partner.sandbox ? "1" : "0",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    statusCode =
      message === "UNAUTHORIZED"
        ? 401
        : message === "FORBIDDEN_SCOPE"
          ? 403
          : message === "CONSENT_REQUIRED"
            ? 403
            : 400;
    if (appId) {
      await logApiUsage({ appId, resource, method, statusCode, sandbox });
    }
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
