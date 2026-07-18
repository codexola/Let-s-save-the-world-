import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRealtimeBedStatus, updateHospitalCapacity } from "@/lib/beds";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const hospitalUserId = req.nextUrl.searchParams.get("hospitalUserId") || undefined;
    let target = hospitalUserId;
    if (!target && session.role === "HOSPITAL") target = session.id;
    const status = await getRealtimeBedStatus(target);
    const history = await prisma.hospitalBedSnapshot.findMany({
      where: { hospitalUserId: status.hospital.userId },
      orderBy: { recordedAt: "desc" },
      take: 12,
    });
    return NextResponse.json({ ...status, history });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["HOSPITAL", "ADMIN", "DEVELOPER"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const action = body.action as string;
    const hospitalUserId = session.role === "HOSPITAL" ? session.id : String(body.hospitalUserId || session.id);

    if (action === "refresh") {
      const status = await getRealtimeBedStatus(hospitalUserId);
      return NextResponse.json(status);
    }

    if (action === "update_capacity") {
      const hospital = await updateHospitalCapacity(
        hospitalUserId,
        {
          totalBeds: body.totalBeds != null ? Number(body.totalBeds) : undefined,
          icuBeds: body.icuBeds != null ? Number(body.icuBeds) : undefined,
          emergencyBeds: body.emergencyBeds != null ? Number(body.emergencyBeds) : undefined,
          isolationRooms: body.isolationRooms != null ? Number(body.isolationRooms) : undefined,
          operatingRooms: body.operatingRooms != null ? Number(body.operatingRooms) : undefined,
          equipment: body.equipment != null ? String(body.equipment) : undefined,
        },
        session.id
      );
      const status = await getRealtimeBedStatus(hospitalUserId);
      return NextResponse.json({ updated: hospital, ...status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
