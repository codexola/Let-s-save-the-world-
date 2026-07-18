import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import {
  listDeveloperPortal,
  createDeveloperApp,
  createApiKey,
  revokeApiKey,
  registerWebhook,
  dispatchWebhook,
  ensureDeveloperSeed,
} from "@/lib/api-platform";

export async function GET() {
  try {
    const session = await requireSession();
    if (!["DEVELOPER", "ADMIN", "COMPANY", "HOSPITAL"].includes(session.role)) {
      // Patients/doctors can still view read-only portal docs via company-less access for demo
      if (!["PATIENT", "DOCTOR"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const portal = await listDeveloperPortal(session.id);
    return NextResponse.json(portal);
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
      const result = await ensureDeveloperSeed(session.id);
      return NextResponse.json(result);
    }

    if (action === "create_app") {
      const app = await createDeveloperApp(
        session.id,
        String(body.name),
        body.description ? String(body.description) : undefined,
        body.sandbox !== false
      );
      await audit(session.id, "api.create_app", "DeveloperApp", app.id);
      return NextResponse.json({ app });
    }

    if (action === "create_key") {
      const result = await createApiKey({
        ownerId: session.id,
        appId: String(body.appId),
        name: String(body.name || "API key"),
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : undefined,
        rateLimit: body.rateLimit != null ? Number(body.rateLimit) : undefined,
      });
      await audit(session.id, "api.create_key", "ApiKey", result.key.id);
      return NextResponse.json({
        key: result.key,
        rawKey: result.raw,
        warning: "Copy the raw key now — it will not be shown again.",
      });
    }

    if (action === "revoke_key") {
      const key = await revokeApiKey(session.id, String(body.keyId));
      return NextResponse.json({ key });
    }

    if (action === "register_webhook") {
      const webhook = await registerWebhook({
        ownerId: session.id,
        appId: String(body.appId),
        url: String(body.url),
        events: Array.isArray(body.events) ? body.events.map(String) : ["*"],
      });
      return NextResponse.json({ webhook });
    }

    if (action === "test_webhook") {
      const deliveries = await dispatchWebhook(String(body.appId), String(body.event || "appointment.created"), {
        demo: true,
        message: "Sandbox webhook test",
      });
      return NextResponse.json({ deliveries });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
