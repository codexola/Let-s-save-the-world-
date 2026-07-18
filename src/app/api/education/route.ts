import { NextRequest, NextResponse } from "next/server";
import { getSession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureEducationCatalog, enrollCourse, completeCourseQuiz } from "@/lib/education";

export async function GET(req: NextRequest) {
  try {
    await ensureEducationCatalog();
    const session = await getSession();
    const courses = await prisma.eduCourse.findMany({
      where: { published: true },
      include: { quizzes: true, _count: { select: { enrollments: true, certificates: true } } },
      orderBy: { createdAt: "desc" },
    });
    const conferences = await prisma.eduConference.findMany({ orderBy: { startsAt: "asc" } });
    let enrollments: unknown[] = [];
    let certificates: unknown[] = [];
    if (session) {
      enrollments = await prisma.eduEnrollment.findMany({
        where: { userId: session.id },
        include: { course: true },
      });
      certificates = await prisma.eduCertificate.findMany({
        where: { userId: session.id },
        include: { course: true },
      });
    }
    const code = req.nextUrl.searchParams.get("code");
    if (code) {
      const cert = await prisma.eduCertificate.findUnique({
        where: { publicCode: code.toUpperCase() },
        include: { course: true, user: { select: { name: true } } },
      });
      if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ certificate: cert });
    }
    return NextResponse.json({ courses, conferences, enrollments, certificates });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const action = body.action as string;

    if (action === "enroll") {
      const enrollment = await enrollCourse(session.id, String(body.courseId));
      return NextResponse.json({ enrollment });
    }

    if (action === "quiz") {
      const result = await completeCourseQuiz({
        userId: session.id,
        courseId: String(body.courseId),
        answers: Array.isArray(body.answers) ? body.answers.map(Number) : [0, 0],
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
