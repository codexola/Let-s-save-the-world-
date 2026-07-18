import { NextRequest, NextResponse } from "next/server";
import { requirePermission, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.USERS_MANAGE);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        verified: true,
        photoUrl: true,
        createdAt: true,
        permissions: { include: { permission: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ users });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.USERS_MANAGE);
    const body = await req.json();

    if (body.action === "set_active") {
      const user = await prisma.user.update({
        where: { id: body.userId },
        data: { active: Boolean(body.active) },
      });
      await audit(session.id, "users.set_active", "User", `${user.email}=${body.active}`);
      return NextResponse.json({ user });
    }

    if (body.action === "verify_doctor") {
      await requirePermission(PERMISSIONS.DOCTORS_VERIFY);
      await prisma.doctorProfile.update({
        where: { userId: body.userId },
        data: {
          verified: true,
          licenseVerified: true,
          govDbVerified: true,
          hospitalConfirmed: true,
        },
      });
      await prisma.user.update({
        where: { id: body.userId },
        data: { verified: true },
      });
      await audit(session.id, "doctors.verify", "DoctorProfile", body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "verify_hospital") {
      await requirePermission(PERMISSIONS.USERS_MANAGE);
      await prisma.hospitalProfile.update({
        where: { userId: body.userId },
        data: {
          verified: true,
          businessRegVerified: true,
          medicalInstitutionVerified: true,
        },
      });
      await prisma.user.update({
        where: { id: body.userId },
        data: { verified: true },
      });
      await audit(session.id, "hospitals.verify", "HospitalProfile", body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "verify_company") {
      await requirePermission(PERMISSIONS.USERS_MANAGE);
      await prisma.companyProfile.update({
        where: { userId: body.userId },
        data: {
          verified: true,
          businessRegVerified: true,
          taxIdVerified: true,
        },
      });
      await prisma.user.update({
        where: { id: body.userId },
        data: { verified: true },
      });
      await audit(session.id, "companies.verify", "CompanyProfile", body.userId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
