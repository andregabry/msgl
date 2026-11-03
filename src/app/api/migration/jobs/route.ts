import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const direction = searchParams.get("direction");

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (direction && direction !== "ALL") {
      where.direction = direction;
    }

    const jobs = await prisma.migrationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sourceGroup: true,
        targetMailbox: true,
        backupArtifact: true,
      },
    });

    return NextResponse.json(
      {
        jobs: jobs.map((j) => ({
          ...j,
          backupArtifact: j.backupArtifact
            ? {
                ...j.backupArtifact,
                bytes: j.backupArtifact.bytes.toString(),
              }
            : null,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
