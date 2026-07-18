import { NextRequest, NextResponse } from "next/server";
import { requireSession, audit } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { researchDashboard, runResearchAiAnalysis, ensureResearchSeed } from "@/lib/research-platform";

export async function GET() {
  try {
    const session = await requireSession();
    const owner =
      (await prisma.user.findFirst({ where: { role: "RESEARCHER" } })) ||
      (await prisma.user.findFirst({ where: { role: "DOCTOR" } }));
    const dash = await researchDashboard(owner?.id || session.id);
    return NextResponse.json(dash);
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
    const action = body.action as string;

    if (action === "share_dataset") {
      const ds = await prisma.researchDataset.create({
        data: {
          ownerId: session.id,
          title: String(body.title),
          institution: body.institution ? String(body.institution) : null,
          description: body.description ? String(body.description) : null,
          accessLevel: String(body.accessLevel || "restricted"),
          recordCount: Number(body.recordCount) || 0,
          tags: body.tags ? String(body.tags) : null,
        },
      });
      await audit(session.id, "research.dataset", "ResearchDataset", ds.id);
      return NextResponse.json({ dataset: ds });
    }

    if (action === "publish_paper") {
      const paper = await prisma.researchPaper.create({
        data: {
          authorId: session.id,
          title: String(body.title),
          abstract: body.abstract ? String(body.abstract) : null,
          institution: body.institution ? String(body.institution) : null,
          status: "published",
          publishedAt: new Date(),
          doi: body.doi ? String(body.doi) : null,
        },
      });
      return NextResponse.json({ paper });
    }

    if (action === "manage_grant") {
      const grant = await prisma.researchGrant.create({
        data: {
          ownerId: session.id,
          title: String(body.title),
          agency: body.agency ? String(body.agency) : null,
          amountYen: Number(body.amountYen) || 0,
          status: "active",
          notes: body.notes ? String(body.notes) : null,
        },
      });
      return NextResponse.json({ grant });
    }

    if (action === "collaborate") {
      const collab = await prisma.researchCollab.create({
        data: {
          title: String(body.title),
          orgType: String(body.orgType || "hospital"),
          orgName: String(body.orgName),
          description: body.description ? String(body.description) : null,
          status: "open",
        },
      });
      return NextResponse.json({ collaboration: collab });
    }

    if (action === "ai_analysis") {
      const analysis = await runResearchAiAnalysis(String(body.datasetId), session.id);
      return NextResponse.json({ analysis });
    }

    if (action === "seed") {
      await ensureResearchSeed(session.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
