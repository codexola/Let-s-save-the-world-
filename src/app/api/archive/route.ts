import { NextRequest, NextResponse } from "next/server";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS, canAccessArchive } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canAccessArchive(session.role, session.permissions)) {
    return NextResponse.json(
      { error: "Archive access is restricted to developer accounts" },
      { status: 403 }
    );
  }

  const archives = await prisma.archive.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ archives });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.ARCHIVE_WRITE);
    const body = await req.json();
    const action = body.action as string;

    if (action === "init") {
      await requirePermission(PERMISSIONS.ARCHIVE_INIT);
      const archive = await prisma.archive.create({
        data: {
          name: body.name || `Archive ${new Date().toISOString()}`,
          description: body.description || "Initialized by developer",
          payload: JSON.stringify(
            body.payload || { modules: [], blogStats: {}, initializedAt: new Date().toISOString() }
          ),
          initialized: true,
          version: 1,
          createdById: session.id,
          updatedById: session.id,
        },
      });
      await audit(session.id, "archive.init", "Archive", archive.id);
      return NextResponse.json({ archive });
    }

    if (action === "update") {
      const existing = await prisma.archive.findUnique({ where: { id: body.id } });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const archive = await prisma.archive.update({
        where: { id: body.id },
        data: {
          name: body.name ?? existing.name,
          description: body.description ?? existing.description,
          payload: body.payload ? JSON.stringify(body.payload) : existing.payload,
          version: existing.version + 1,
          updatedById: session.id,
        },
      });
      await audit(session.id, "archive.update", "Archive", archive.id);
      return NextResponse.json({ archive });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
