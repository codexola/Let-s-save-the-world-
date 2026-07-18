import { NextRequest, NextResponse } from "next/server";
import { requirePermission, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { createDatabaseBackup, listBackups, recordSecurityEvent, zeroTrustStatus } from "@/lib/security-ops";

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(PERMISSIONS.USERS_MANAGE);
    void session;
    const section = req.nextUrl.searchParams.get("section") || "overview";

    if (section === "audit") {
      await requirePermission(PERMISSIONS.AUDIT_VIEW);
      const logs = await prisma.auditLog.findMany({
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ logs });
    }

    if (section === "coupons") {
      const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
      return NextResponse.json({ coupons });
    }

    if (section === "complaints") {
      const complaints = await prisma.complaint.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      return NextResponse.json({ complaints });
    }

    if (section === "reviews") {
      const reviews = await prisma.review.findMany({
        include: { author: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ reviews });
    }

    if (section === "payments") {
      const invoices = await prisma.invoice.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ invoices });
    }

    if (section === "security") {
      const [events, backups] = await Promise.all([
        prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
        listBackups(),
      ]);
      return NextResponse.json({
        events,
        backups,
        zeroTrust: zeroTrustStatus(),
        sessionUser: session.email,
      });
    }

    if (section === "verifications") {
      const pending = await prisma.identityVerification.findMany({
        where: { status: "pending" },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ pending });
    }

    const [
      userCount,
      openTickets,
      openComplaints,
      pendingSubs,
      flaggedReviews,
      openInvoices,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.supportTicket.count({ where: { status: "open" } }),
      prisma.complaint.count({ where: { status: "open" } }),
      prisma.subscription.count({ where: { status: "PENDING" } }),
      prisma.review.count({ where: { spamFlag: true } }),
      prisma.invoice.count({ where: { status: "OPEN" } }),
    ]);

    return NextResponse.json({
      overview: {
        userCount,
        openTickets,
        openComplaints,
        pendingSubs,
        flaggedReviews,
        openInvoices,
      },
    });
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

    if (body.action === "create_coupon") {
      await requirePermission(PERMISSIONS.COUPONS_MANAGE);
      const coupon = await prisma.coupon.create({
        data: {
          code: String(body.code).toUpperCase(),
          description: body.description || null,
          discountPercent: Number(body.discountPercent) || 0,
          discountYen: Number(body.discountYen) || 0,
          ambassadorOnly: Boolean(body.ambassadorOnly),
          maxUses: body.maxUses != null ? Number(body.maxUses) : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });
      await audit(session.id, "admin.coupon_create", "Coupon", coupon.id);
      return NextResponse.json({ coupon });
    }

    if (body.action === "resolve_complaint") {
      const complaint = await prisma.complaint.update({
        where: { id: String(body.id) },
        data: {
          status: String(body.status || "resolved"),
          resolution: body.resolution ? String(body.resolution) : null,
        },
      });
      await audit(session.id, "admin.complaint_resolve", "Complaint", complaint.id);
      return NextResponse.json({ complaint });
    }

    if (body.action === "moderate_review") {
      const review = await prisma.review.update({
        where: { id: String(body.id) },
        data: {
          spamFlag: Boolean(body.spamFlag),
          fraudScore: body.fraudScore != null ? Number(body.fraudScore) : undefined,
        },
      });
      return NextResponse.json({ review });
    }

    if (body.action === "update_ticket") {
      const ticket = await prisma.supportTicket.update({
        where: { id: String(body.id) },
        data: { status: String(body.status || "resolved") },
      });
      return NextResponse.json({ ticket });
    }

    if (body.action === "approve_hospital") {
      await requirePermission(PERMISSIONS.HOSPITALS_APPROVE);
      const user = await prisma.user.update({
        where: { id: String(body.userId) },
        data: { verified: true },
      });
      await prisma.hospitalProfile.updateMany({
        where: { userId: user.id },
        data: { verified: true },
      });
      await audit(session.id, "admin.hospital_approve", "User", user.id);
      return NextResponse.json({ user });
    }

    if (body.action === "create_backup") {
      const result = await createDatabaseBackup(session.id);
      await recordSecurityEvent({
        type: "backup_created",
        severity: "info",
        userId: session.id,
        details: result.record.filename,
      });
      return NextResponse.json({ backup: result.record });
    }

    if (body.action === "file_complaint") {
      // also allow via this admin path for logging
      const complaint = await prisma.complaint.create({
        data: {
          userId: session.id,
          name: session.name,
          email: session.email,
          subject: String(body.subject),
          body: String(body.body),
          againstType: body.againstType || null,
          againstId: body.againstId || null,
        },
      });
      return NextResponse.json({ complaint });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
