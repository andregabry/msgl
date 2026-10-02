import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }

    const jobs = await prisma.migrationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sourceGroup: true,
        targetMailbox: true,
        backupArtifact: true,
        events: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      jobs: jobs.map((j) => ({
        ...j,
        backupArtifact: j.backupArtifact
          ? {
              ...j.backupArtifact,
              bytes: j.backupArtifact.bytes.toString(),
            }
          : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
