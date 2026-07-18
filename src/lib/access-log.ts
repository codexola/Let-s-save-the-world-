import { prisma } from "./db";

/** PHI access logging for APPI / HIPAA / GDPR accountability */
export async function logAccess(opts: {
  userId?: string | null;
  accessorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.accessLog.create({
    data: {
      userId: opts.userId || null,
      accessorId: opts.accessorId || null,
      action: opts.action,
      resource: opts.resource,
      resourceId: opts.resourceId || null,
      ip: opts.ip || null,
      userAgent: opts.userAgent || null,
    },
  });
}

export function clientMeta(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent");
  return { ip, userAgent };
}
