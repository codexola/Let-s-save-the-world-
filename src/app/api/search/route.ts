import { NextRequest, NextResponse } from "next/server";
import { parseSearchParams, runSearch } from "@/lib/search-engine";
import { DISEASE_CATALOG } from "@/lib/search-catalog";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("catalog") === "diseases") {
    return NextResponse.json({ diseases: DISEASE_CATALOG });
  }

  const filters = parseSearchParams(req.nextUrl.searchParams);
  const result = await runSearch(filters);

  // Keep backward-compatible aliases used by older UI
  return NextResponse.json({
    ...result,
    blogs: [],
    posts: [],
    platformReviews: [],
    query: filters.q || "",
    type: filters.type || "all",
  });
}
