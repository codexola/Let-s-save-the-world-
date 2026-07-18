import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildRecommendations } from "@/lib/recommend";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — sign in for personalized recommendations" }, { status: 401 });
  }

  const lat = req.nextUrl.searchParams.get("latitude") || req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("longitude") || req.nextUrl.searchParams.get("lng");
  const limit = req.nextUrl.searchParams.get("limit");

  const result = await buildRecommendations(session.id, {
    latitude: lat ? Number(lat) : undefined,
    longitude: lng ? Number(lng) : undefined,
    limit: limit ? Number(limit) : 8,
  });

  return NextResponse.json({
    ...result,
    disclaimer: "Recommendations are personalized rankings, not medical advice.",
  });
}
