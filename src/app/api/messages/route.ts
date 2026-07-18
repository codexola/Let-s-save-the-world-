import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function GET() {
  try {
    const session = await requireSession();

    const threads = await prisma.chatThread.findMany({
      where: {
        OR: [{ participantAId: session.id }, { participantBId: session.id }],
      },
      include: {
        participantA: { select: { id: true, name: true, photoUrl: true } },
        participantB: { select: { id: true, name: true, photoUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = threads.map((t) => ({
      ...t,
      chatEnabled: t.agreedByA && t.agreedByB,
      myAgreed: t.participantAId === session.id ? t.agreedByA : t.agreedByB,
      partnerAgreed: t.participantAId === session.id ? t.agreedByB : t.agreedByA,
    }));

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

      const [a, b] = normalizePair(session.id, partnerId);
      const thread = await prisma.chatThread.upsert({
        where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
        update: {},
        create: { participantAId: a, participantBId: b },
        include: {
          participantA: { select: { id: true, name: true, photoUrl: true } },
          participantB: { select: { id: true, name: true, photoUrl: true } },
        },
      });

      await audit(session.id, "messages.request_thread", "ChatThread", thread.id);
      return NextResponse.json({ thread, chatEnabled: thread.agreedByA && thread.agreedByB });
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

      const message = await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          senderId: session.id,
          body: String(body.body),
          attachment: body.attachment ? String(body.attachment) : null,
        },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });

      return NextResponse.json({ message });
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
          notice: "Waiting for mutual agreement to enable chat",
        });
      }

      const messages = await prisma.chatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, photoUrl: true } } },
      });

      return NextResponse.json({ messages, chatEnabled: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
