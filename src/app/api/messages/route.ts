import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptMessage, decryptMessage, looksEncrypted } from "@/lib/chat-crypto";
import { contactsNeededForRole, resolvePairType } from "@/lib/chat-pairs";

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function isCompanyEmployee(companyUserId: string, employeeUserId: string): Promise<boolean> {
  const company = await prisma.companyProfile.findUnique({ where: { userId: companyUserId } });
  const employee = await prisma.user.findUnique({ where: { id: employeeUserId } });
  if (!company || !employee) return false;
  if (!company.employeesJson) return employee.role === Role.PATIENT;
  try {
    const list = JSON.parse(company.employeesJson) as Array<{ email?: string; name?: string }>;
    return list.some(
      (e) =>
        (e.email && e.email.toLowerCase() === employee.email.toLowerCase()) ||
        (e.name && e.name.toLowerCase() === employee.name.toLowerCase())
    );
  } catch {
    return company.employeesJson.toLowerCase().includes(employee.email.toLowerCase());
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;

    if (sp.get("contacts") === "1") {
      const roles = contactsNeededForRole(session.role);
      const users = await prisma.user.findMany({
        where: {
          active: true,
          role: { in: roles as Role[] },
          id: { not: session.id },
        },
        select: { id: true, name: true, email: true, role: true, photoUrl: true },
        take: 100,
        orderBy: { name: "asc" },
      });

      let contacts = users;
      if (session.role === Role.COMPANY) {
        const filtered = [];
        for (const u of users) {
          if (u.role === Role.HOSPITAL) filtered.push(u);
          else if (u.role === Role.PATIENT && (await isCompanyEmployee(session.id, u.id))) {
            filtered.push(u);
          }
        }
        contacts = filtered;
      }

      return NextResponse.json({ contacts });
    }

    const threads = await prisma.chatThread.findMany({
      where: {
        OR: [{ participantAId: session.id }, { participantBId: session.id }],
      },
      include: {
        participantA: { select: { id: true, name: true, photoUrl: true, role: true } },
        participantB: { select: { id: true, name: true, photoUrl: true, role: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = threads.map((t) => {
      const last = t.messages[0];
      return {
        ...t,
        messages: last
          ? [
              {
                ...last,
                body: last.encrypted || looksEncrypted(last.body) ? decryptMessage(last.body) : last.body,
              },
            ]
          : [],
        chatEnabled: t.agreedByA && t.agreedByB,
        myAgreed: t.participantAId === session.id ? t.agreedByA : t.agreedByB,
        partnerAgreed: t.participantAId === session.id ? t.agreedByB : t.agreedByA,
        encrypted: t.encrypted,
      };
    });

    return NextResponse.json({ threads: enriched });
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

    if (body.action === "request_thread") {
      const partnerId = String(body.partnerId);
      if (partnerId === session.id) {
        return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
      }

      const partner = await prisma.user.findUnique({ where: { id: partnerId } });
      if (!partner || !partner.active) {
        return NextResponse.json({ error: "Partner not found" }, { status: 404 });
      }

      const pairType = resolvePairType(session.role, partner.role);
      if (!pairType) {
        return NextResponse.json(
          {
            error: `Messaging not allowed between ${session.role} and ${partner.role}. Allowed: Patient↔Doctor/Nurse/Hospital, Doctor↔Hospital, Company↔Hospital/Employee.`,
          },
          { status: 403 }
        );
      }

      if (pairType === "COMPANY_EMPLOYEE") {
        const companyId = session.role === Role.COMPANY ? session.id : partnerId;
        const employeeId = session.role === Role.COMPANY ? partnerId : session.id;
        const ok = await isCompanyEmployee(companyId, employeeId);
        if (!ok) {
          return NextResponse.json(
            { error: "Employee must be listed on the company roster (employees JSON email/name)" },
            { status: 403 }
          );
        }
      }

      const [a, b] = normalizePair(session.id, partnerId);
      const thread = await prisma.chatThread.upsert({
        where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
        update: { pairType },
        create: {
          participantAId: a,
          participantBId: b,
          pairType,
          encrypted: true,
        },
        include: {
          participantA: { select: { id: true, name: true, photoUrl: true, role: true } },
          participantB: { select: { id: true, name: true, photoUrl: true, role: true } },
        },
      });

      await audit(session.id, "messages.request_thread", "ChatThread", `${thread.id}:${pairType}`);
      return NextResponse.json({
        thread,
        pairType,
        chatEnabled: thread.agreedByA && thread.agreedByB,
      });
    }

    if (body.action === "agree") {
      const thread = await prisma.chatThread.findUnique({ where: { id: body.threadId } });
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

      const isA = thread.participantAId === session.id;
      const isB = thread.participantBId === session.id;
      if (!isA && !isB) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const updated = await prisma.chatThread.update({
        where: { id: thread.id },
        data: isA ? { agreedByA: true } : { agreedByB: true },
      });

      await audit(session.id, "messages.agree", "ChatThread", thread.id);
      return NextResponse.json({
        thread: updated,
        chatEnabled: updated.agreedByA && updated.agreedByB,
      });
    }

    if (body.action === "send") {
      const thread = await prisma.chatThread.findUnique({ where: { id: body.threadId } });
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

      const isParticipant =
        thread.participantAId === session.id || thread.participantBId === session.id;
      if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      if (!thread.agreedByA || !thread.agreedByB) {
        return NextResponse.json(
          { error: "Both parties must agree before chatting" },
          { status: 403 }
        );
      }

      const plaintext = String(body.body || "");
      const attachmentType = body.attachmentType ? String(body.attachmentType) : null;
      const attachment = body.attachment ? String(body.attachment) : null;
      const attachmentName = body.attachmentName ? String(body.attachmentName) : null;
      const prescriptionId = body.prescriptionId ? String(body.prescriptionId) : null;

      if (prescriptionId) {
        const rx = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
        if (!rx) return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
        if (rx.patientId !== session.id && rx.doctorId !== session.id) {
          return NextResponse.json({ error: "Cannot share this prescription" }, { status: 403 });
        }
      }

      if (!plaintext && !attachment && !prescriptionId) {
        return NextResponse.json({ error: "Message body or attachment required" }, { status: 400 });
      }

      const storedBody = encryptMessage(
        plaintext ||
          (prescriptionId
            ? `[Prescription shared: ${prescriptionId}]`
            : `[Attachment: ${attachmentType || "file"}]`)
      );

      const message = await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          senderId: session.id,
          body: storedBody,
          encrypted: true,
          attachment,
          attachmentType: prescriptionId ? "prescription" : attachmentType,
          attachmentName,
          prescriptionId,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      return NextResponse.json({
        message: {
          ...message,
          body: decryptMessage(message.body),
        },
      });
    }

    if (body.action === "list_messages") {
      const thread = await prisma.chatThread.findUnique({ where: { id: body.threadId } });
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

      const isParticipant =
        thread.participantAId === session.id || thread.participantBId === session.id;
      if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      if (!thread.agreedByA || !thread.agreedByB) {
        return NextResponse.json({
          messages: [],
          chatEnabled: false,
          notice: "Waiting for mutual agreement to enable encrypted chat",
        });
      }

      const messages = await prisma.chatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      return NextResponse.json({
        messages: messages.map((m) => ({
          ...m,
          body: m.encrypted || looksEncrypted(m.body) ? decryptMessage(m.body) : m.body,
        })),
        chatEnabled: true,
        encrypted: true,
        pairType: thread.pairType,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
