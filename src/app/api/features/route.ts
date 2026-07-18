import { NextRequest, NextResponse } from "next/server";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const features = await prisma.featureFlag.findMany({ orderBy: { category: "asc" } });
  return NextResponse.json({ features });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.FEATURES_TOGGLE);
    const body = await req.json();

    if (body.action === "toggle") {
      const feature = await prisma.featureFlag.findUnique({ where: { id: body.id } });
      if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (feature.key === "archive" && session.role !== "DEVELOPER") {
        return NextResponse.json(
          { error: "Only developers can enable/disable the archive module" },
          { status: 403 }
        );
      }

      const updated = await prisma.featureFlag.update({
        where: { id: body.id },
        data: { enabled: Boolean(body.enabled) },
      });
      await audit(session.id, "features.toggle", "FeatureFlag", `${feature.key}=${body.enabled}`);
      return NextResponse.json({ feature: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
