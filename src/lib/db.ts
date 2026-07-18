import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function resolveDatabaseUrl(): string {
  if (process.env.VERCEL || process.env.USE_TMP_DB === "1") {
    const tmpDb = "/tmp/medcare.db";
    const candidates = [
      path.join(process.cwd(), "prisma", "seed-data.db"),
      path.join(process.cwd(), "prisma", "dev.db"),
    ];
    if (!fs.existsSync(tmpDb)) {
      for (const sourceDb of candidates) {
        if (fs.existsSync(sourceDb)) {
          fs.copyFileSync(sourceDb, tmpDb);
          break;
        }
      }
    }
    return `file:${tmpDb}`;
  }

  const envUrl = process.env.DATABASE_URL;
  if (envUrl && envUrl.startsWith("file:")) {
    const rel = envUrl.replace(/^file:/, "").replace(/^\.\//, "");
    const absolute = path.isAbsolute(rel)
      ? rel
      : path.join(process.cwd(), rel);
    return `file:${absolute}`;
  }

  const fallback = path.join(process.cwd(), "prisma", "dev.db");
  const altPath = "C:/Users/Administrator/medcare-data/dev.db";
  if (fs.existsSync(altPath)) {
    return `file:${altPath}`;
  }
  return `file:${fallback}`;
}

function createPrismaClient() {
  const url = resolveDatabaseUrl();
  return new PrismaClient({
    datasources: { db: { url } },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function getDatabasePath(): string {
  return resolveDatabaseUrl().replace(/^file:/, "");
}
