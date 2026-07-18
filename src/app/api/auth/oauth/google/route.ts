import { NextRequest, NextResponse } from "next/server";
import { makeOAuthHandlers } from "@/lib/oauth-handlers";

const handlers = makeOAuthHandlers("google");

export async function GET(req: NextRequest) {
  return handlers.GET(req);
}
