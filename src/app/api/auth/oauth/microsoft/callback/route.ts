import { NextRequest } from "next/server";
import { makeOAuthHandlers } from "@/lib/oauth-handlers";

const handlers = makeOAuthHandlers("microsoft");

export async function GET(req: NextRequest) {
  return handlers.handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handlers.POST(req);
}
