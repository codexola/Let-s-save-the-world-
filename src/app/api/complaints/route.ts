import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isStaff = session.role === "ADMIN" || session.role === "DEVELOPER";
  const complaints = await prisma.complaint.findMany({
    where: isStaff ? undefined : { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ complaints });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = await req.json();
  const complaint = await prisma.complaint.create({
    data: {
      userId: session?.id,
      name: String(body.name || session?.name || "Anonymous"),
      email: String(body.email || session?.email || "unknown@medcare.local"),
      subject: String(body.subject),
      body: String(body.body),
      againstType: body.againstType || null,
      againstId: body.againstId || null,
    },
  });
  return NextResponse.json({ complaint });
}
