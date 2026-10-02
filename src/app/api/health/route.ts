import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/lib/queue/connection";
import { storageProvider } from "@/lib/storage/backup-storage.provider";
import { isGoogleConfigured } from "@/lib/google/auth";
import { graphClient } from "@/lib/microsoft/graph.client";

export async function GET() {
  const checks: Record<string, { status: "UP" | "DOWN" | "NOT_CONFIGURED"; message?: string }> = {};

  // 1. PostgreSQL Check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgresql = { status: "UP" };
  } catch (err: any) {
    checks.postgresql = { status: "DOWN", message: err.message };
  }

  // 2. Redis Check
  try {
    const ping = await redisConnection.ping();
    checks.redis = ping === "PONG" ? { status: "UP" } : { status: "DOWN" };
  } catch (err: any) {
    checks.redis = { status: "DOWN", message: err.message };
  }

  // 3. Storage Check
  try {
    const exists = await storageProvider.exists(".");
    checks.storage = exists ? { status: "UP" } : { status: "DOWN", message: "Storage root inacessível" };
  } catch (err: any) {
    checks.storage = { status: "DOWN", message: err.message };
  }

  // 4. Google Workspace Check
  checks.google = isGoogleConfigured() ? { status: "UP" } : { status: "NOT_CONFIGURED" };

  // 5. Microsoft Graph Check
  checks.microsoft = graphClient.isConfigured() ? { status: "UP" } : { status: "NOT_CONFIGURED" };

  const isHealthy = checks.postgresql.status === "UP" && checks.storage.status === "UP";

  return NextResponse.json(
    {
      status: isHealthy ? "HEALTHY" : "DEGRADED",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}
