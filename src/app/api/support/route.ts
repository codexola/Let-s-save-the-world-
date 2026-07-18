import { NextRequest, NextResponse } from "next/server";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isStaff =
      session.role === "ADMIN" ||
      session.role === "DEVELOPER" ||
      session.permissions.includes(PERMISSIONS.SUPPORT_ACCESS);

    if (isStaff) {
      const [tickets, contacts] = await Promise.all([
        prisma.supportTicket.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      ]);
      return NextResponse.json({ tickets, contacts });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { OR: [{ userId: session.id }, { email: session.email }] },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getSession();

    if (body.action === "inquiry") {
      const ticket = await prisma.supportTicket.create({
        data: {
          userId: session?.id,
          name: String(body.name || session?.name || "Guest"),
          email: String(body.email || session?.email || ""),
          subject: String(body.subject),
          body: String(body.body),
          status: "open",
          assignedTo: body.target === "developer" ? "developer" : "admin",
        },
      });

      if (session) await audit(session.id, "support.inquiry", "SupportTicket", ticket.id);

      return NextResponse.json({
        ok: true,
        ticket,
        message: "Your inquiry was sent to MedCare support (admin/developer only).",
      });
    }

    if (body.action === "contact") {
      const contact = await prisma.contactRequest.create({
        data: {
          userId: session?.id,
          name: String(body.name),
          email: String(body.email),
          subject: String(body.subject),
          body: String(body.body),
          target: body.target === "developer" ? "developer" : "admin",
        },
      });
      return NextResponse.json({ ok: true, contact });
    }

    if (body.action === "update_status") {
      await requirePermission(PERMISSIONS.SUPPORT_ACCESS);
      const ticket = await prisma.supportTicket.update({
        where: { id: body.id },
        data: { status: String(body.status), assignedTo: body.assignedTo },
      });
      return NextResponse.json({ ticket });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
