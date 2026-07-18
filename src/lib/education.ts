import { randomBytes } from "crypto";
import { prisma } from "./db";
import { audit } from "./auth";

export async function ensureEducationCatalog() {
  const count = await prisma.eduCourse.count();
  if (count > 0) return;

  const courses = [
    {
      title: "Hypertension guidelines update 2026",
      type: "cme",
      description: "CME module on BP targets and first-line therapy.",
      cmeCredits: 1.5,
      durationMin: 45,
      mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    },
    {
      title: "Simulation: septic shock resuscitation",
      type: "simulation",
      description: "Interactive case simulation for early sepsis bundle.",
      cmeCredits: 2,
      durationMin: 60,
    },
    {
      title: "Case study: chest pain in primary care",
      type: "case_study",
      description: "Walkthrough of ACS risk stratification.",
      cmeCredits: 1,
      durationMin: 30,
    },
    {
      title: "Infection control training video",
      type: "video",
      description: "PPE donning/doffing and isolation precautions.",
      cmeCredits: 0.5,
      durationMin: 20,
      mediaUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    },
    {
      title: "Medical conference highlight: cardio summit",
      type: "conference",
      description: "Recorded sessions from regional cardiology conference.",
      cmeCredits: 3,
      durationMin: 180,
    },
  ];

  for (const c of courses) {
    const course = await prisma.eduCourse.create({ data: { ...c, published: true } });
    await prisma.eduQuiz.createMany({
      data: [
        {
          courseId: course.id,
          question: `Primary learning check for "${c.title}"?`,
          optionsJson: JSON.stringify(["Apply guideline-directed care", "Ignore labs", "Skip documentation", "Delay triage"]),
          answerIndex: 0,
        },
        {
          courseId: course.id,
          question: "CME certificates require quiz completion?",
          optionsJson: JSON.stringify(["Yes", "No", "Only for nurses", "Never"]),
          answerIndex: 0,
        },
      ],
    });
  }

  await prisma.eduConference.create({
    data: {
      title: "MedCare Digital Medicine Conference 2026",
      location: "Tokyo International Forum + virtual",
      startsAt: new Date(Date.now() + 30 * 86400_000),
      description: "Live CME tracks and simulation workshops.",
      virtualUrl: "https://medcare.local/conference",
    },
  });
}

export async function enrollCourse(userId: string, courseId: string) {
  return prisma.eduEnrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: {},
    create: { userId, courseId, progress: 10 },
  });
}

export async function completeCourseQuiz(opts: {
  userId: string;
  courseId: string;
  answers: number[];
}) {
  const quizzes = await prisma.eduQuiz.findMany({ where: { courseId: opts.courseId } });
  let correct = 0;
  quizzes.forEach((q, i) => {
    if (opts.answers[i] === q.answerIndex) correct += 1;
  });
  const score = quizzes.length ? Math.round((correct / quizzes.length) * 100) : 0;
  const course = await prisma.eduCourse.findUnique({ where: { id: opts.courseId } });
  const enrollment = await prisma.eduEnrollment.upsert({
    where: { userId_courseId: { userId: opts.userId, courseId: opts.courseId } },
    update: { progress: 100, completed: score >= 50, quizScore: score },
    create: {
      userId: opts.userId,
      courseId: opts.courseId,
      progress: 100,
      completed: score >= 50,
      quizScore: score,
    },
  });

  let certificate = null;
  if (enrollment.completed && course) {
    certificate = await prisma.eduCertificate.findFirst({
      where: { userId: opts.userId, courseId: opts.courseId },
    });
    if (!certificate) {
      certificate = await prisma.eduCertificate.create({
        data: {
          userId: opts.userId,
          courseId: opts.courseId,
          publicCode: `CME-${randomBytes(3).toString("hex").toUpperCase()}`,
          cmeCredits: course.cmeCredits,
        },
      });
      await audit(opts.userId, "edu.certificate", "EduCertificate", certificate.id);
    }
  }
  return { enrollment, score, passed: enrollment.completed, certificate };
}
